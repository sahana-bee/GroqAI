import os
import csv
import io
from pypdf import PdfReader
import docx

MAX_EXTRACTED_CHARS = 30000

def extract_text_from_file(file_storage, filename):
    """
    Extracts text from uploaded file object (Werkzeug FileStorage or bytes).
    Supports: PDF, DOCX, TXT, CSV.
    Returns: (text, file_type, error_message)
    """
    ext = os.path.splitext(filename)[1].lower()
    
    try:
        if ext == ".txt":
            return extract_txt(file_storage), "txt", None
        elif ext == ".pdf":
            return extract_pdf(file_storage), "pdf", None
        elif ext in [".docx", ".doc"]:
            return extract_docx(file_storage), "docx", None
        elif ext == ".csv":
            return extract_csv(file_storage), "csv", None
        elif ext in [".png", ".jpg", ".jpeg", ".webp", ".gif"]:
            return extract_image(file_storage, filename), "image", None
        else:
            return None, None, f"Unsupported file type: {ext}. Supported types: PDF, DOCX, TXT, CSV, PNG, JPG, WEBP, GIF."
    except Exception as e:
        return None, None, f"Failed to extract text from {filename}: {str(e)}"

def extract_txt(file_storage):
    content = file_storage.read()
    file_storage.seek(0)
    # Try utf-8, fallback to latin-1
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1", errors="replace")
    
    return truncate_text(text)

def extract_pdf(file_storage):
    reader = PdfReader(file_storage)
    text_chunks = []
    for idx, page in enumerate(reader.pages):
        page_text = page.extract_text()
        if page_text:
            text_chunks.append(f"--- Page {idx + 1} ---\n{page_text.strip()}")
    
    file_storage.seek(0)
    full_text = "\n\n".join(text_chunks)
    if not full_text.strip():
        return "[PDF contains no extractable text or is scanned/image-based]"
    return truncate_text(full_text)

def extract_docx(file_storage):
    doc = docx.Document(file_storage)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    
    # Also extract tables if present
    table_texts = []
    for t_idx, table in enumerate(doc.tables):
        rows_data = []
        for row in table.rows:
            rows_data.append(" | ".join([cell.text.strip() for cell in row.cells]))
        if rows_data:
            table_texts.append(f"--- Table {t_idx + 1} ---\n" + "\n".join(rows_data))
            
    file_storage.seek(0)
    all_text = "\n\n".join(paragraphs + table_texts)
    return truncate_text(all_text)

def extract_csv(file_storage):
    content = file_storage.read()
    file_storage.seek(0)
    try:
        decoded = content.decode("utf-8")
    except UnicodeDecodeError:
        decoded = content.decode("latin-1", errors="replace")
        
    reader = csv.reader(io.StringIO(decoded))
    rows = list(reader)
    if not rows:
        return "[CSV file is empty]"
    
    header = rows[0]
    total_rows = len(rows)
    
    # Format first 50 rows as markdown table for AI readability
    preview_rows = rows[:51] # header + 50 rows
    lines = []
    lines.append("| " + " | ".join(header) + " |")
    lines.append("| " + " | ".join(["---"] * len(header)) + " |")
    for r in preview_rows[1:]:
        # Pad or truncate cells to match header length
        cells = r[:len(header)] + [""] * max(0, len(header) - len(r))
        lines.append("| " + " | ".join(c.replace("\n", " ").strip() for c in cells) + " |")
        
    summary = f"[CSV Summary: Total Rows = {total_rows}, Total Columns = {len(header)}]\n\n"
    table_str = "\n".join(lines)
    if total_rows > 51:
        table_str += f"\n\n... [Truncated {total_rows - 51} additional rows for token budget] ..."
        
    return truncate_text(summary + table_str)

def extract_image(file_storage, filename):
    import time
    upload_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    
    timestamp = int(time.time() * 1000)
    clean_name = f"{timestamp}_{filename.replace(' ', '_')}"
    save_path = os.path.join(upload_dir, clean_name)
    
    content = file_storage.read()
    file_storage.seek(0)
    with open(save_path, "wb") as f:
        f.write(content)
        
    rel_url = f"/static/uploads/{clean_name}"
    return f"![{filename}]({rel_url})\n\n[User uploaded image: {filename}]"

def truncate_text(text, max_chars=MAX_EXTRACTED_CHARS):
    text = text.strip()
    if len(text) > max_chars:
        return text[:max_chars] + f"\n\n... [Content truncated at {max_chars} characters to fit context window] ..."
    return text
