import os
import json
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, Response, stream_with_context
from werkzeug.utils import secure_filename
import database
import groq_service
import file_extractor

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "sahana-chatbot-secret-key-2026")
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024  # 25 MB max upload

# Initialize database
database.init_db()

# Ensure default demo user exists for smooth experience
def ensure_default_user():
    user = database.authenticate_user("demo", "demo1234")
    if not user:
        database.register_user("demo", "demo@example.com", "demo1234")

ensure_default_user()

def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Unauthorized"}), 401
            return redirect(url_for("login_view"))
        return f(*args, **kwargs)
    return decorated_function

# ----------------- Authentication Views ----------------- #

@app.route("/login", methods=["GET", "POST"])
def login_view():
    if "user_id" in session:
        return redirect(url_for("index_view"))
    
    error = None
    if request.method == "POST":
        login_input = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()
        user = database.authenticate_user(login_input, password)
        if user:
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            return redirect(url_for("index_view"))
        else:
            error = "Invalid username/email or password"
            
    return render_template("auth.html", mode="login", error=error)

@app.route("/register", methods=["GET", "POST"])
def register_view():
    if "user_id" in session:
        return redirect(url_for("index_view"))

    error = None
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "").strip()
        
        if len(username) < 3:
            error = "Username must be at least 3 characters"
        elif len(password) < 6:
            error = "Password must be at least 6 characters"
        else:
            user_id, err = database.register_user(username, email, password)
            if user_id:
                session["user_id"] = user_id
                session["username"] = username
                return redirect(url_for("index_view"))
            else:
                error = err or "Registration failed"
                
    return render_template("auth.html", mode="register", error=error)

@app.route("/logout")
def logout_view():
    session.clear()
    return redirect(url_for("login_view"))

# ----------------- Main Chat View ----------------- #

@app.route("/")
@login_required
def index_view():
    user_id = session["user_id"]
    user = database.get_user_by_id(user_id)
    settings = database.get_user_settings(user_id)
    has_api_key = bool(groq_service.get_api_key())
    return render_template("index.html", user=user, settings=settings, has_api_key=has_api_key, models=groq_service.AVAILABLE_MODELS)

# ----------------- User & Settings API ----------------- #

@app.route("/api/auth/me", methods=["GET"])
@login_required
def get_current_user():
    user_id = session["user_id"]
    user = database.get_user_by_id(user_id)
    settings = database.get_user_settings(user_id)
    has_api_key = bool(groq_service.get_api_key())
    return jsonify({
        "user": user,
        "settings": settings,
        "has_api_key": has_api_key,
        "available_models": groq_service.AVAILABLE_MODELS
    })

@app.route("/api/settings", methods=["POST"])
@login_required
def update_settings():
    user_id = session["user_id"]
    data = request.json or {}
    database.update_user_settings(user_id, **data)
    updated = database.get_user_settings(user_id)
    return jsonify({"success": True, "settings": updated})

@app.route("/api/profile/password", methods=["POST"])
@login_required
def update_password():
    user_id = session["user_id"]
    data = request.json or {}
    old_pwd = data.get("current_password", "")
    new_pwd = data.get("new_password", "")
    if len(new_pwd) < 6:
        return jsonify({"success": False, "error": "New password must be at least 6 characters"}), 400
        
    ok, err = database.update_user_password(user_id, old_pwd, new_pwd)
    if ok:
        return jsonify({"success": True, "message": "Password updated successfully"})
    return jsonify({"success": False, "error": err}), 400

# ----------------- Chat Management APIs ----------------- #

@app.route("/api/chats", methods=["GET"])
@login_required
def list_chats():
    user_id = session["user_id"]
    chats = database.get_user_chats(user_id)
    return jsonify({"chats": chats})

@app.route("/api/chats", methods=["POST"])
@login_required
def create_new_chat():
    user_id = session["user_id"]
    data = request.json or {}
    settings = database.get_user_settings(user_id)
    
    personality = data.get("personality") or settings.get("personality", "helpful")
    language = data.get("language") or settings.get("language", "en")
    title = data.get("title", "New Conversation")
    
    chat_id = database.create_chat(user_id, title=title, personality=personality, language=language)
    return jsonify({"success": True, "chat_id": chat_id, "title": title})

@app.route("/api/chats/<int:chat_id>", methods=["GET"])
@login_required
def get_chat_detail(chat_id):
    user_id = session["user_id"]
    chat = database.get_chat(chat_id, user_id)
    if not chat:
        return jsonify({"error": "Chat not found"}), 404
        
    messages = database.get_chat_messages(chat_id)
    attachments = database.get_chat_attachments(chat_id)
    return jsonify({
        "chat": chat,
        "messages": messages,
        "attachments": attachments
    })

@app.route("/api/chats/<int:chat_id>/rename", methods=["POST"])
@login_required
def rename_chat_route(chat_id):
    user_id = session["user_id"]
    data = request.json or {}
    title = data.get("title", "").strip()
    if not title:
        return jsonify({"error": "Title cannot be empty"}), 400
        
    ok = database.rename_chat(chat_id, user_id, title)
    if ok:
        return jsonify({"success": True, "title": title})
    return jsonify({"error": "Failed to rename chat"}), 400

@app.route("/api/chats/<int:chat_id>", methods=["DELETE"])
@login_required
def delete_chat_route(chat_id):
    user_id = session["user_id"]
    ok = database.delete_chat(chat_id, user_id)
    if ok:
        return jsonify({"success": True})
    return jsonify({"error": "Failed to delete chat"}), 400

# ----------------- Groq Key Configuration API ----------------- #

@app.route("/api/config/key", methods=["POST"])
@login_required
def configure_key_route():
    data = request.json or {}
    key = data.get("api_key", "").strip()
    if not key or len(key) < 10:
        return jsonify({"error": "Invalid Groq API key"}), 400
    groq_service.set_api_key(key)
    return jsonify({"success": True, "message": "Groq API key successfully saved to .even and .env!"})

# ----------------- Image Generation & Asset Helper ----------------- #

def generate_image_asset(prompt):
    import urllib.request
    import urllib.parse
    import time
    
    # 1. Expand prompt using Groq for photorealistic details
    enhanced = prompt
    client = groq_service.get_groq_client()
    if client:
        try:
            resp = client.chat.completions.create(
                model="qwen/qwen3.8-27b",
                messages=[
                    {"role": "system", "content": "You are an AI visual concept artist. Expand the user's idea into a vivid, cinematic, high-detail prompt for image generation. Under 30 words. Return ONLY the expanded prompt text."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=50,
                temperature=0.7
            )
            desc = resp.choices[0].message.content.strip().strip('"')
            if desc:
                enhanced = desc
        except Exception:
            pass

    # 2. Query Pollinations image API and download
    upload_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    
    encoded = urllib.parse.quote(enhanced)
    seed = int(time.time() * 1000) % 100000
    gen_url = f"https://image.pollinations.ai/prompt/{encoded}?width=1024&height=1024&nologo=true&seed={seed}"
    
    clean_filename = f"gen_{int(time.time()*1000)}.jpg"
    local_path = os.path.join(upload_dir, clean_filename)
    
    try:
        req = urllib.request.Request(gen_url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        with urllib.request.urlopen(req, timeout=18) as resp:
            data = resp.read()
            with open(local_path, "wb") as f:
                f.write(data)
        rel_url = f"/static/uploads/{clean_filename}"
        return rel_url, enhanced, None
    except Exception as e:
        # Fallback to direct URL if local download timed out
        return gen_url, enhanced, None

@app.route("/api/generate-image", methods=["POST"])
@login_required
def generate_image_route():
    data = request.json or {}
    prompt = data.get("prompt", "").strip()
    chat_id = data.get("chat_id")
    if not prompt:
        return jsonify({"error": "Prompt cannot be empty"}), 400

    rel_url, enhanced, err = generate_image_asset(prompt)
    if err:
        return jsonify({"error": err}), 500

    markdown_reply = f"![{prompt}]({rel_url})\n\n🎨 **AI Visual Reply:** *\"{prompt}\"*"
    if chat_id:
        database.add_message(int(chat_id), "assistant", markdown_reply)

    return jsonify({
        "success": True,
        "image_url": rel_url,
        "prompt": prompt,
        "enhanced_prompt": enhanced,
        "markdown": markdown_reply
    })

# ----------------- Messaging & Groq AI SSE Stream ----------------- #

@app.route("/api/chats/<int:chat_id>/message", methods=["POST"])
@login_required
def send_message(chat_id):
    user_id = session["user_id"]
    chat = database.get_chat(chat_id, user_id)
    if not chat:
        return jsonify({"error": "Chat not found"}), 404

    data = request.json or {}
    user_content = data.get("content", "").strip()
    model = data.get("model") or "qwen/qwen3.8-27b"
    image_mode = data.get("image_mode") is True
    
    if not user_content:
        return jsonify({"error": "Message cannot be empty"}), 400

    # Auto-detect if user entered a Groq API key in the chat (starts with gsk_ or GROQ_API_KEY=gsk_)
    raw_key = user_content
    if "gsk_" in raw_key:
        import re
        match = re.search(r'(gsk_[A-Za-z0-9_-]{20,})', raw_key)
        if match:
            extracted_key = match.group(1)
            groq_service.set_api_key(extracted_key)
            database.add_message(chat_id, "user", "Set Groq API Key: [Key Configured]")
            success_reply = (
                "🎉 **Groq API Key Configured Successfully!**\n\n"
                "Your key has been saved to `.even` and `.env`. You can now chat with Groq AI, "
                "upload files, and use Voice AI. How can I help you today?"
            )
            database.add_message(chat_id, "assistant", success_reply)
            def key_stream():
                yield f"data: {json.dumps({'chunk': success_reply, 'done': True})}\n\n"
            return Response(stream_with_context(key_stream()), mimetype="text/event-stream")

    # Check for Image Reply Mode or explicit /image or draw commands
    lower = user_content.lower()
    is_image_cmd = (
        image_mode or 
        user_content.startswith("/image") or 
        user_content.startswith("/imagine") or 
        lower.startswith("generate image") or
        lower.startswith("create image") or
        lower.startswith("draw ")
    )
    
    if is_image_cmd:
        clean_prompt = user_content
        for prefix in ["/image", "/imagine", "generate image of", "generate image", "create image of", "create image", "draw"]:
            if clean_prompt.lower().startswith(prefix):
                clean_prompt = clean_prompt[len(prefix):].strip(" :,-")
                break
        if not clean_prompt:
            clean_prompt = user_content

        database.add_message(chat_id, "user", user_content)
        
        def image_reply_stream():
            yield f"data: {json.dumps({'chunk': '🎨 Generating image with AI visual model...', 'done': False})}\n\n"
            rel_url, enhanced, _ = generate_image_asset(clean_prompt)
            markdown_reply = f"![{clean_prompt}]({rel_url})\n\n🎨 **AI Visual Reply:** *\"{clean_prompt}\"*\n\n> *Style: {enhanced}*"
            database.add_message(chat_id, "assistant", markdown_reply)
            yield f"data: {json.dumps({'replace': True, 'content': markdown_reply, 'chunk': '', 'done': True})}\n\n"

        return Response(stream_with_context(image_reply_stream()), mimetype="text/event-stream")

    # Save user message
    database.add_message(chat_id, "user", user_content)

    # Auto-rename if this is the first user message and default title
    all_msgs = database.get_chat_messages(chat_id)
    if len(all_msgs) == 1 and chat["title"] in ["New Conversation", "New Chat"]:
        new_title = groq_service.generate_chat_title(user_content)
        database.rename_chat(chat_id, user_id, new_title)

    # Prepare context for streaming
    return stream_ai_response(chat_id, user_id, model)

@app.route("/api/chats/<int:chat_id>/regenerate", methods=["POST"])
@login_required
def regenerate_response(chat_id):
    user_id = session["user_id"]
    chat = database.get_chat(chat_id, user_id)
    if not chat:
        return jsonify({"error": "Chat not found"}), 404

    data = request.json or {}
    model = data.get("model") or "qwen/qwen3.8-27b"

    # Remove the last assistant message
    database.delete_last_assistant_message(chat_id)

    # Re-stream response based on existing conversation
    return stream_ai_response(chat_id, user_id, model)

def stream_ai_response(chat_id, user_id, model):
    chat = database.get_chat(chat_id, user_id)
    settings = database.get_user_settings(user_id)
    messages = database.get_chat_messages(chat_id)
    attachments = database.get_chat_full_attachment_texts(chat_id)

    # Format attachments into context text
    attachments_context = ""
    if attachments:
        docs = []
        for att in attachments:
            docs.append(f"--- File: {att['filename']} ---\n{att['extracted_text']}")
        attachments_context = "\n\n".join(docs)

    # Format messages for Groq API
    groq_messages = [{"role": m["role"], "content": m["content"]} for m in messages]

    personality = chat.get("personality") or settings.get("personality", "helpful")
    language = chat.get("language") or settings.get("language", "en")
    custom_prompt = settings.get("custom_system_prompt", "")

    def event_stream():
        full_assistant_reply = []
        try:
            stream = groq_service.generate_chat_stream(
                messages=groq_messages,
                model=model,
                personality=personality,
                language=language,
                custom_prompt=custom_prompt,
                attachments_context=attachments_context
            )
            for chunk in stream:
                full_assistant_reply.append(chunk)
                yield f"data: {json.dumps({'chunk': chunk, 'done': False})}\n\n"

            # Save full assistant message to database
            final_text = "".join(full_assistant_reply)
            if final_text.strip():
                msg_id = database.add_message(chat_id, "assistant", final_text)
                yield f"data: {json.dumps({'chunk': '', 'done': True, 'message_id': msg_id})}\n\n"
            else:
                yield f"data: {json.dumps({'chunk': '', 'done': True})}\n\n"

        except Exception as e:
            err = f"Error during generation: {str(e)}"
            yield f"data: {json.dumps({'chunk': err, 'done': True, 'error': True})}\n\n"

    return Response(stream_with_context(event_stream()), mimetype="text/event-stream")

# ----------------- File Upload & Attachments API ----------------- #

@app.route("/api/upload", methods=["POST"])
@login_required
def upload_file():
    user_id = session["user_id"]
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    chat_id = request.form.get("chat_id")
    
    if not file or file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not chat_id:
        # Create a new chat automatically if chat_id not provided
        chat_id = database.create_chat(user_id, title=f"File: {file.filename[:20]}")
    else:
        chat_id = int(chat_id)
        chat = database.get_chat(chat_id, user_id)
        if not chat:
            return jsonify({"error": "Chat not found"}), 404

    filename = secure_filename(file.filename) or "document"
    file_size = len(file.read())
    file.seek(0)

    # Extract text from file (PDF, DOCX, TXT, CSV)
    extracted_text, file_type, err = file_extractor.extract_text_from_file(file, filename)
    if err:
        return jsonify({"error": err}), 400

    attachment_id = database.add_attachment(
        chat_id=chat_id,
        filename=filename,
        file_type=file_type,
        extracted_text=extracted_text,
        file_size=file_size
    )

    return jsonify({
        "success": True,
        "chat_id": chat_id,
        "attachment": {
            "id": attachment_id,
            "filename": filename,
            "file_type": file_type,
            "file_size": file_size,
            "preview": extracted_text[:200] + "..." if len(extracted_text) > 200 else extracted_text
        }
    })

@app.route("/api/attachments/<int:att_id>", methods=["DELETE"])
@login_required
def remove_attachment(att_id):
    chat_id = request.args.get("chat_id")
    if not chat_id:
        return jsonify({"error": "chat_id required"}), 400
        
    chat = database.get_chat(int(chat_id), session["user_id"])
    if not chat:
        return jsonify({"error": "Chat not found"}), 404

    ok = database.delete_attachment(att_id, int(chat_id))
    return jsonify({"success": ok})

# ----------------- Voice AI: Audio Transcription API ----------------- #

@app.route("/api/voice/transcribe", methods=["POST"])
@login_required
def transcribe_audio_endpoint():
    if "audio" not in request.files:
        return jsonify({"error": "No audio file uploaded"}), 400

    audio_file = request.files["audio"]
    filename = secure_filename(audio_file.filename) or "voice.wav"
    audio_bytes = audio_file.read()

    text, err = groq_service.transcribe_audio(audio_bytes, filename=filename)
    if err:
        return jsonify({"error": err}), 400

    return jsonify({"success": True, "text": text})

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
