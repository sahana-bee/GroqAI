import sqlite3
import os
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chatbot.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            avatar TEXT DEFAULT 'default',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # User Settings table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id INTEGER PRIMARY KEY,
            theme TEXT DEFAULT 'dark',
            font_size TEXT DEFAULT 'normal',
            language TEXT DEFAULT 'en',
            personality TEXT DEFAULT 'helpful',
            custom_system_prompt TEXT DEFAULT '',
            preferred_model TEXT DEFAULT 'llama-3.3-70b-versatile',
            auto_speak BOOLEAN DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)

    # Chats table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL DEFAULT 'New Conversation',
            personality TEXT DEFAULT 'helpful',
            language TEXT DEFAULT 'en',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)

    # Messages table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
        )
    """)

    # Attachments table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER NOT NULL,
            message_id INTEGER,
            filename TEXT NOT NULL,
            file_type TEXT NOT NULL,
            extracted_text TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE,
            FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE SET NULL
        )
    """)

    conn.commit()
    conn.close()

# ----------------- User Management ----------------- #

def register_user(username, email, password):
    conn = get_db()
    cursor = conn.cursor()
    pwd_hash = generate_password_hash(password)
    try:
        cursor.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
            (username.strip(), email.strip().lower(), pwd_hash)
        )
        user_id = cursor.lastrowid
        # Initialize default settings
        cursor.execute(
            "INSERT INTO user_settings (user_id) VALUES (?)",
            (user_id,)
        )
        conn.commit()
        return user_id, None
    except sqlite3.IntegrityError as e:
        if "username" in str(e).lower():
            return None, "Username is already taken"
        elif "email" in str(e).lower():
            return None, "Email is already registered"
        return None, "Registration failed"
    finally:
        conn.close()

def authenticate_user(username_or_email, password):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM users WHERE username = ? OR email = ?",
        (username_or_email.strip(), username_or_email.strip().lower())
    )
    user = cursor.fetchone()
    conn.close()
    if user and check_password_hash(user["password_hash"], password):
        return dict(user)
    return None

def get_user_by_id(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, email, avatar, created_at FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None

def update_user_password(user_id, old_password, new_password):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    if not user or not check_password_hash(user["password_hash"], old_password):
        conn.close()
        return False, "Incorrect current password"
    
    new_hash = generate_password_hash(new_password)
    cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))
    conn.commit()
    conn.close()
    return True, None

# ----------------- Settings Management ----------------- #

def get_user_settings(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM user_settings WHERE user_id = ?", (user_id,))
    settings = cursor.fetchone()
    if not settings:
        cursor.execute("INSERT INTO user_settings (user_id) VALUES (?)", (user_id,))
        conn.commit()
        cursor.execute("SELECT * FROM user_settings WHERE user_id = ?", (user_id,))
        settings = cursor.fetchone()
    conn.close()
    return dict(settings) if settings else {}

def update_user_settings(user_id, **kwargs):
    allowed = {
        'theme', 'font_size', 'language', 'personality', 
        'custom_system_prompt', 'preferred_model', 'auto_speak', 'background'
    }
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return
    
    conn = get_db()
    cursor = conn.cursor()
    set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
    values = list(updates.values()) + [user_id]
    cursor.execute(f"UPDATE user_settings SET {set_clause} WHERE user_id = ?", values)
    conn.commit()
    conn.close()

# ----------------- Chat Management ----------------- #

def create_chat(user_id, title="New Conversation", personality="helpful", language="en"):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO chats (user_id, title, personality, language) VALUES (?, ?, ?, ?)",
        (user_id, title, personality, language)
    )
    chat_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return chat_id

def get_user_chats(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT c.*, 
               (SELECT content FROM messages WHERE chat_id = c.id ORDER BY id DESC LIMIT 1) as last_message,
               (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) as message_count
        FROM chats c 
        WHERE c.user_id = ? 
        ORDER BY c.updated_at DESC
        """,
        (user_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_chat(chat_id, user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM chats WHERE id = ? AND user_id = ?", (chat_id, user_id))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def rename_chat(chat_id, user_id, new_title):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE chats SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
        (new_title.strip()[:100], chat_id, user_id)
    )
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0

def delete_chat(chat_id, user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM chats WHERE id = ? AND user_id = ?", (chat_id, user_id))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0

# ----------------- Message Management ----------------- #

def add_message(chat_id, role, content):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)",
        (chat_id, role, content)
    )
    msg_id = cursor.lastrowid
    cursor.execute("UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (chat_id,))
    conn.commit()
    conn.close()
    return msg_id

def get_chat_messages(chat_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, role, content, created_at FROM messages WHERE chat_id = ? ORDER BY id ASC",
        (chat_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def delete_last_assistant_message(chat_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, role FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1",
        (chat_id,)
    )
    last = cursor.fetchone()
    if last and last["role"] == "assistant":
        cursor.execute("DELETE FROM messages WHERE id = ?", (last["id"],))
        conn.commit()
        conn.close()
        return True
    conn.close()
    return False

# ----------------- Attachments Management ----------------- #

def add_attachment(chat_id, filename, file_type, extracted_text, file_size, message_id=None):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO attachments (chat_id, message_id, filename, file_type, extracted_text, file_size)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (chat_id, message_id, filename, file_type, extracted_text, file_size)
    )
    att_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return att_id

def get_chat_attachments(chat_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, filename, file_type, file_size, created_at, SUBSTR(extracted_text, 1, 200) as preview FROM attachments WHERE chat_id = ? ORDER BY id ASC",
        (chat_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_chat_full_attachment_texts(chat_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT filename, extracted_text FROM attachments WHERE chat_id = ? ORDER BY id ASC",
        (chat_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def delete_attachment(attachment_id, chat_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM attachments WHERE id = ? AND chat_id = ?", (attachment_id, chat_id))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0
