import os
import sys
import datetime
import hashlib
import hmac
import bcrypt
import json
from functools import wraps
import time
import uuid
import threading
from collections import OrderedDict
from flask import Flask, request, jsonify, session
from flask_cors import CORS # type: ignore



# Add root directory to path to ensure modules can be imported
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from db import fetch_one, fetch_all, execute_query

from preprocessing.text_cleaner import TextCleaner # type: ignore
# Report export utilities
from utils.report_export import (
    export_report,
    get_fake_review_report_data,
    get_product_trust_report_data,
    get_user_activity_report_data,
    get_monthly_report_data,
    get_ai_performance_report_data,
)
from models.nlp_analysis import NLPAnalyzer # type: ignore
from models.classifier import FakeReviewClassifier # type: ignore
from rag.vector_store import VectorStore
from rag.knowledge_base import initialize_default_knowledge_base
from rag.rag_engine import RAGPipeline
from ocr_pipeline import extract_reviews as extract_screenshot_reviews

app = Flask(__name__)

def hash_user_password(password):
    """Create a bcrypt hash compatible with PHP password_verify()."""
    if not isinstance(password, str) or not password:
        raise ValueError('Password is required')
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=10)).decode('ascii')
    # PHP emits $2y$ bcrypt hashes. The payload is otherwise equivalent to
    # $2b$, and Python's bcrypt verifier accepts both prefixes.
    return '$2y$' + password_hash[4:] if password_hash.startswith('$2b$') else password_hash

def verify_user_password(password, password_hash):
    """Verify only recognized bcrypt hashes without mutating stored data."""
    if not isinstance(password, str) or not isinstance(password_hash, str):
        return False
    try:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('ascii'))
    except ValueError:
        return False

def _load_env_file():
    env_file = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.env'))
    if os.path.exists(env_file):
        try:
            file_values = {}
            with open(env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    key, val = line.split('=', 1)
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    if key:
                        file_values[key] = val
            force_file_values = file_values.get('ECHOTRACE_FORCE_ENV_FILE') == '1'
            for key, val in file_values.items():
                if force_file_values or key not in os.environ:
                    os.environ[key] = val
        except Exception:
            pass

_load_env_file()

# Flask is an internal AI service. Browser requests go through the PHP API,
# which adds the service key below. Do not add a source-controlled fallback
# secret here: it would make every deployment share the same credentials.
FLASK_SECRET_KEY = os.environ.get('ECHOTRACE_FLASK_SECRET_KEY', '')
SERVICE_KEY = os.environ.get('ECHOTRACE_SERVICE_KEY', '')
ALLOWED_ORIGINS = [
    origin.strip() for origin in os.environ.get(
        'ECHOTRACE_ALLOWED_ORIGINS',
        'http://localhost:8000,http://127.0.0.1:8000,http://localhost,http://127.0.0.1'
    ).split(',') if origin.strip()
]
app.config.update(
    SECRET_KEY=FLASK_SECRET_KEY,
    MAX_CONTENT_LENGTH=26 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=os.environ.get('ECHOTRACE_COOKIE_SECURE', '0') == '1',
)
# Kept only for the legacy Flask admin UI. EchoTrace's dashboard uses the PHP
# API; credentials are never accepted cross-origin by the AI service.
CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=False)


def service_auth_required(func):
    """Require the PHP backend's shared secret for internal AI operations."""
    @wraps(func)
    def wrapped(*args, **kwargs):
        supplied = request.headers.get('X-EchoTrace-Service-Key', '')
        if not SERVICE_KEY:
            app.logger.error('ECHOTRACE_SERVICE_KEY is not configured')
            return jsonify({'success': False, 'error': 'AI service is not configured'}), 503
        if not supplied or not hmac.compare_digest(supplied, SERVICE_KEY):
            return jsonify({'success': False, 'error': 'Unauthorized AI service request'}), 401
        return func(*args, **kwargs)
    return wrapped


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({
        'success': False,
        'error_code': 'ocr_upload_limit',
        'error': 'The uploaded screenshots exceed the 25 MB request limit. No review text was extracted or saved.',
    }), 413


def read_json_object():
    """Return a JSON object or a safe client-facing validation error."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def load_training_metrics():
    """Load metrics only when they belong to the current model artifacts."""
    models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
    metrics_path = os.path.join(models_dir, 'training_metrics.json')
    model_path = os.path.join(models_dir, 'fake_review_model.pkl')
    vectorizer_path = os.path.join(models_dir, 'tfidf_vectorizer.pkl')
    try:
        if not all(os.path.isfile(path) for path in (metrics_path, model_path, vectorizer_path)):
            return None
        artifact_mtime = max(os.path.getmtime(model_path), os.path.getmtime(vectorizer_path))
        if os.path.getmtime(metrics_path) + 2 < artifact_mtime:
            app.logger.warning('Model evaluation metrics are older than the model artifacts')
            return None
        with open(metrics_path, encoding='utf-8') as metrics_file:
            metrics = json.load(metrics_file)
        if not isinstance(metrics, dict):
            return None
        accuracy = metrics.get('test_accuracy', metrics.get('accuracy'))
        if not isinstance(accuracy, (int, float)):
            return None
        if not 0 <= float(accuracy) <= 100 or int(metrics.get('test_size', 0)) < 1:
            return None
        return metrics
    except (OSError, ValueError, TypeError):
        app.logger.exception('Could not load model evaluation metrics')
        return None


def _normalize_accuracy_metric(val):
    if val is None:
        return None
    try:
        f = float(val)
        if f < 0 or f > 100:
            return None
        if 0 < f <= 1.0:
            return round(f * 100.0, 2)
        return round(f, 2)
    except (ValueError, TypeError):
        return None


def model_evaluation_summary():
    metrics = load_training_metrics()
    if not metrics:
        return {
            'status': 'not_evaluated', 'test_accuracy': None,
            'validation_accuracy': None, 'model_version': None,
            'evaluated_at': None, 'evaluation_split': None,
        }
    return {
        'status': 'evaluated',
        'test_accuracy': _normalize_accuracy_metric(metrics.get('test_accuracy', metrics.get('accuracy'))),
        'validation_accuracy': _normalize_accuracy_metric(metrics.get('validation_accuracy')),
        'model_version': metrics.get('pipeline_version'),
        'evaluated_at': metrics.get('evaluated_at', metrics.get('trained_at')),
        'evaluation_split': metrics.get('evaluation_split', 'held_out_test'),
        'test_size': metrics.get('test_size'),
        'validation_size': metrics.get('validation_size'),
        'dataset_versions': metrics.get('dataset_versions', []),
        'dataset_scope': metrics.get('dataset_scope', 'synthetic_labeled_data'),
        'split_strategy': metrics.get('split_strategy', 'group_aware'),
    }

# Initialize AI & RAG Modules
cleaner = TextCleaner()
analyzer = NLPAnalyzer()
classifier = FakeReviewClassifier()

# Prediction cache is process-local, bounded, and keyed by the loaded model
# metadata plus normalized review text. It never stores credentials or tokens.
_prediction_cache = OrderedDict()
_prediction_cache_lock = threading.Lock()
_prediction_cache_limit = 512

def _prediction_cache_key(text, cleaned_text):
    model_marker = f"{getattr(classifier, 'model_version', id(getattr(classifier, 'model', None)))}:{getattr(classifier, 'decision_threshold', 0.5):.4f}:{getattr(classifier, 'is_ready', False)}"
    return hashlib.sha256(f"{model_marker}\0{text}\0{cleaned_text}".encode('utf-8')).hexdigest()

def _prediction_cache_get(key):
    with _prediction_cache_lock:
        value = _prediction_cache.get(key)
        if value is not None:
            _prediction_cache.move_to_end(key)
        return value

def _prediction_cache_put(key, value):
    with _prediction_cache_lock:
        _prediction_cache[key] = value
        _prediction_cache.move_to_end(key)
        while len(_prediction_cache) > _prediction_cache_limit:
            _prediction_cache.popitem(last=False)


def _normalize_probability_classification(is_fake, confidence, reasons):
    """Apply the documented probability bands to public API results."""
    confidence = float(confidence)
    if 40.0 <= confidence <= 60.0:
        classification = "Uncertain Review"
        effective_is_fake = 0
    elif confidence > 60.0:
        classification = "Suspicious Review"
        effective_is_fake = 1
    else:
        classification = "Genuine Review"
        effective_is_fake = 0
    return effective_is_fake, confidence, reasons, classification

vector_store = VectorStore()
initialize_default_knowledge_base(vector_store)
rag_pipeline = RAGPipeline(vector_store)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy",
        "service": "EchoTrace AI Engine",
        "timestamp": time.time(),
        "rag_ready": vector_store.is_fitted
    })

# -------------------
# RAG Machine Learning Endpoints
# -------------------
@app.route('/rag/query', methods=['POST'])
@service_auth_required
def rag_query():
    try:
        data = read_json_object()
        if not data:
            return jsonify({"success": False, "error": "A JSON request body is required"}), 400
        query = data.get('query', '')
        if not isinstance(query, str) or not query.strip() or len(query.strip()) > 2000:
            return jsonify({"success": False, "error": "Query string is required"}), 400
        try:
            top_k = max(1, min(int(data.get('top_k', 3)), 10))
        except (TypeError, ValueError):
            return jsonify({"success": False, "error": "top_k must be a number"}), 400
        category = data.get('category')
        if category is not None and (not isinstance(category, str) or len(category) > 80):
            return jsonify({"success": False, "error": "Invalid category"}), 400
        
        result = rag_pipeline.query_assistant(user_query=query.strip(), top_k=top_k, category=category)
        return jsonify({"success": True, "rag": result})
    except Exception:
        app.logger.exception('RAG query failed')
        return jsonify({"success": False, "error": "RAG query could not be completed"}), 500

@app.route('/rag/explain_review', methods=['POST'])
@service_auth_required
def rag_explain_review():
    data = read_json_object() or {}
    text = data.get('text', '')
    if not isinstance(text, str) or not text.strip() or len(text) > 10000:
        return jsonify({"success": False, "error": "A review text up to 10000 characters is required"}), 400
    is_fake = bool(data.get('is_fake', False))
    try:
        confidence = max(0.0, min(float(data.get('confidence', 50.0)), 100.0))
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Invalid confidence"}), 400
    reasons = data.get('reasons', [])
    if not isinstance(reasons, list) or len(reasons) > 10 or not all(isinstance(reason, str) and len(reason) <= 300 for reason in reasons):
        return jsonify({"success": False, "error": "Invalid review reasons"}), 400
    
    explanation = rag_pipeline.explain_review(
        review_text=text,
        is_fake=is_fake,
        confidence=confidence,
        reasons=reasons
    )
    return jsonify({"success": True, "explanation": explanation})

@app.route('/rag/synthesize_audit', methods=['POST'])
@service_auth_required
def rag_synthesize_audit():
    data = read_json_object() or {}
    title = data.get('title', 'Product Under Scan')
    if not isinstance(title, str) or len(title) > 500:
        return jsonify({"success": False, "error": "Invalid product title"}), 400
    try:
        total = int(data.get('total_reviews', 0))
        fake_count = int(data.get('fake_count', 0))
        trust_score = float(data.get('trust_score', 0.0))
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Invalid audit metrics"}), 400
    if total < 0 or fake_count < 0 or fake_count > total or not 0 <= trust_score <= 100:
        return jsonify({"success": False, "error": "Invalid audit metrics"}), 400
    
    synthesis = rag_pipeline.synthesize_product_audit(
        product_title=title,
        total_reviews=total,
        fake_count=fake_count,
        trust_score=trust_score
    )
    return jsonify({"success": True, "synthesis": synthesis})

@app.route('/rag/knowledge', methods=['GET'])
@service_auth_required
def rag_list_knowledge():
    docs = vector_store.list_documents()
    return jsonify({"success": True, "documents": docs, "stats": vector_store.get_stats()})

@app.route('/rag/knowledge/add', methods=['POST'])
@service_auth_required
def rag_add_knowledge():
    data = read_json_object() or {}
    title = data.get('title')
    content = data.get('content')
    category = data.get('category', 'custom')
    tags = data.get('tags', [])
    
    if not isinstance(title, str) or not isinstance(content, str) or not title.strip() or not content.strip():
        return jsonify({"success": False, "error": "Title and content are required"}), 400
    if len(title) > 200 or len(content) > 50000 or not isinstance(category, str) or len(category) > 80:
        return jsonify({"success": False, "error": "Knowledge document exceeds supported limits"}), 400
    if not isinstance(tags, list) or len(tags) > 20 or not all(isinstance(tag, str) and len(tag) <= 50 for tag in tags):
        return jsonify({"success": False, "error": "Invalid document tags"}), 400
        
    doc_id = vector_store.add_document(title=title, content=content, category=category, tags=tags)
    return jsonify({"success": True, "doc_id": doc_id, "message": "Document indexed in RAG vector store successfully"})

@app.route('/rag/knowledge/delete', methods=['POST'])
@service_auth_required
def rag_delete_knowledge():
    data = read_json_object() or {}
    doc_id = data.get('doc_id')
    if not isinstance(doc_id, str) or not doc_id or len(doc_id) > 100:
        return jsonify({"success": False, "error": "doc_id is required"}), 400
    
    success = vector_store.delete_document(doc_id)
    if success:
        return jsonify({"success": True, "message": f"Document {doc_id} deleted successfully", "stats": vector_store.get_stats()})
    else:
        return jsonify({"success": False, "error": "Document not found"}), 404

@app.route('/rag/knowledge/reindex', methods=['POST'])
@service_auth_required
def rag_reindex():
    initialize_default_knowledge_base(vector_store, force_reindex=True)
    return jsonify({"success": True, "message": "Knowledge base re-indexed successfully", "stats": vector_store.get_stats()})

@app.route('/rag/stats', methods=['GET'])
@service_auth_required
def rag_stats():
    stats = vector_store.get_stats()
    return jsonify({"success": True, "stats": stats})

# -------------------
# Admin Utility Functions & Decorators
# -------------------

def admin_login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_id' not in session:
            return jsonify({"success": False, "error": "Admin authentication required"}), 401
        return f(*args, **kwargs)
    return decorated_function

def role_required(required_role):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            admin_id = session.get('admin_id')
            admin = fetch_one("SELECT * FROM users WHERE id = %s", (admin_id,))
            if not admin:
                return jsonify({"success": False, "error": "Invalid admin session"}), 401
            if required_role == 'super' and admin.get('role') != 'admin':
                return jsonify({"success": False, "error": "Super admin permission required"}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# -------------------
# Admin Authentication Endpoints
# -------------------
@app.route('/admin/auth/register', methods=['POST'])
def admin_register():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    username = data.get('username') or email.split('@')[0]
    if not email or not password:
        return jsonify({"success": False, "error": "Email and password required"}), 400
    
    existing = fetch_one("SELECT id FROM users WHERE email = %s", (email,))
    if existing:
        return jsonify({"success": False, "error": "Email already registered"}), 400
    
    password_hash = hash_user_password(password)
    new_id = execute_query(
        "INSERT INTO users (username, email, password_hash, role) VALUES (%s, %s, %s, 'admin')",
        (username, email, password_hash)
    )
    if not new_id:
        return jsonify({"success": False, "error": "Database error"}), 500
        
    return jsonify({"success": True, "admin_id": new_id})

@app.route('/admin/auth/login', methods=['POST'])
def admin_login():
    data = request.get_json()
    email = data.get('email')
    username_or_email = data.get('username_or_email')
    
    login_id = email or username_or_email
    password = data.get('password')
    
    admin = fetch_one("SELECT * FROM users WHERE (email = %s OR username = %s) AND role = 'admin'", (login_id, login_id))
    
    if not admin or not verify_user_password(password, admin['password_hash']):
        return jsonify({"success": False, "error": "Invalid credentials"}), 401
    session['admin_id'] = admin['id']
    return jsonify({"success": True, "message": "Logged in"})

@app.route('/admin/auth/logout', methods=['POST'])
@admin_login_required
def admin_logout():
    session.pop('admin_id', None)
    return jsonify({"success": True, "message": "Logged out"})

# Placeholder endpoints for forgot/reset (no email service in prototype)
@app.route('/admin/auth/forgot', methods=['POST'])
def admin_forgot_password():
    return jsonify({"success": True, "message": "Password reset link sent (stub)"})

@app.route('/admin/auth/reset', methods=['POST'])
def admin_reset_password():
    data = request.get_json()
    token = data.get('token')
    new_password = data.get('new_password')
    # In a real app, verify token; here we just accept
    return jsonify({"success": True, "message": "Password has been reset (stub)"})

@app.route('/admin/auth/change_password', methods=['POST'])
@admin_login_required
def admin_change_password():
    data = request.get_json()
    old_password = data.get('old_password')
    new_password = data.get('new_password')
    admin = fetch_one("SELECT * FROM users WHERE id = %s AND role = 'admin'", (session['admin_id'],))
    if not admin:
        return jsonify({"success": False, "error": "Admin not found"}), 404
    if not verify_user_password(old_password, admin['password_hash']):
        return jsonify({"success": False, "error": "Old password incorrect"}), 400
    execute_query("UPDATE users SET password_hash = %s WHERE id = %s", (hash_user_password(new_password), session['admin_id']))
    return jsonify({"success": True, "message": "Password changed"})

# -------------------
# Admin Dashboard Endpoint
# -------------------
@app.route('/admin/dashboard', methods=['GET'])
@admin_login_required
def admin_dashboard():
    total_users_row = fetch_one("SELECT COUNT(*) as count FROM users")
    total_users = total_users_row['count'] if total_users_row else 0
    
    active_users_row = fetch_one("SELECT COUNT(*) as count FROM users WHERE status = 'active'")
    active_users = active_users_row['count'] if active_users_row else 0
    
    total_products_row = fetch_one("SELECT COUNT(*) as count FROM products")
    total_products = total_products_row['count'] if total_products_row else 0
    
    total_reviews_row = fetch_one("SELECT COUNT(*) as count FROM reviews")
    total_reviews = total_reviews_row['count'] if total_reviews_row else 0
    
    fake_reviews_row = fetch_one("SELECT COUNT(*) as count FROM review_analysis WHERE is_fake = 1")
    fake_reviews = fake_reviews_row['count'] if fake_reviews_row else 0
    
    genuine_reviews = total_reviews - fake_reviews
    
    model_evaluation = model_evaluation_summary()
    
    pending_reports_row = fetch_one("SELECT COUNT(*) as count FROM feedback WHERE status = 'pending'")
    pending_reports = pending_reports_row['count'] if pending_reports_row else 0
    
    data = {
        "total_users": total_users,
        "active_users": active_users,
        "total_products": total_products,
        "total_reviews": total_reviews,
        "fake_reviews": fake_reviews,
        "genuine_reviews": genuine_reviews,
        "ai_accuracy": model_evaluation['test_accuracy'],
        "pending_community_reports": pending_reports,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    return jsonify({"success": True, "dashboard": data, "model_evaluation": model_evaluation})

# -------------------
# User Management Endpoints (Admin)
# -------------------
@app.route('/admin/users', methods=['GET'])
@admin_login_required
def admin_list_users():
    search = request.args.get('search', '').lower()
    status = request.args.get('status')
    
    query = "SELECT id, username, email, role, status, created_at FROM users WHERE 1=1"
    params = []
    
    if search:
        query += " AND (username LIKE %s OR email LIKE %s)"
        params.extend([f"%{search}%", f"%{search}%"])
    if status:
        query += " AND status = %s"
        params.append(status)
        
    query += " ORDER BY created_at DESC"
    users = fetch_all(query, tuple(params))
    
    # Format created_at to string for JSON serialization
    for user in users:
        if user.get('created_at'):
            user['created_at'] = user['created_at'].isoformat()
            
    return jsonify({"success": True, "users": users})

@app.route('/admin/users/<user_id>', methods=['GET'])
@admin_login_required
def admin_get_user(user_id):
    user = fetch_one("SELECT id, username, email, role, status, created_at FROM users WHERE id = %s", (user_id,))
    if not user:
        
        return jsonify({"success": False, "error": "User not found"}), 404
    if user.get('created_at'):
        user['created_at'] = user['created_at'].isoformat()
    return jsonify({"success": True, "user": user})

@app.route('/admin/users/<user_id>', methods=['PUT'])
@admin_login_required
def admin_update_user(user_id):
    user = fetch_one("SELECT id FROM users WHERE id = %s", (user_id,))
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404
    data = request.get_json()
    if 'username' in data:
        execute_query("UPDATE users SET username = %s WHERE id = %s", (data['username'], user_id))
    if 'email' in data:
        execute_query("UPDATE users SET email = %s WHERE id = %s", (data['email'], user_id))
    return jsonify({"success": True, "message": "User updated"})

@app.route('/admin/users/<user_id>/activate', methods=['PATCH'])
@admin_login_required
def admin_activate_user(user_id):
    user = fetch_one("SELECT id FROM users WHERE id = %s", (user_id,))
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404
    execute_query("UPDATE users SET status = 'active' WHERE id = %s", (user_id,))
    return jsonify({"success": True, "message": "User activated"})

@app.route('/admin/users/<user_id>/deactivate', methods=['PATCH'])
@admin_login_required
def admin_deactivate_user(user_id):
    user = fetch_one("SELECT id FROM users WHERE id = %s", (user_id,))
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404
    execute_query("UPDATE users SET status = 'blocked' WHERE id = %s", (user_id,))
    return jsonify({"success": True, "message": "User deactivated"})

@app.route('/admin/users/<user_id>', methods=['DELETE'])
@admin_login_required
def admin_delete_user(user_id):
    user = fetch_one("SELECT id FROM users WHERE id = %s", (user_id,))
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404
    execute_query("DELETE FROM users WHERE id = %s", (user_id,))
    return jsonify({"success": True, "message": "User deleted"})

@app.route('/admin/users/<user_id>/reset_password', methods=['POST'])
@admin_login_required
def admin_reset_user_password(user_id):
    # Stub: In real app, would send email or generate temporary password
    return jsonify({"success": True, "message": f"Password reset for user {user_id} (stub)"})

@app.route('/admin/users/<user_id>/history', methods=['GET'])
@admin_login_required
def admin_user_history(user_id):
    # Stub: Return empty history list
    return jsonify({"success": True, "history": []})

# -----------------------------------------------------------------
# Admin Profile Endpoints
# -----------------------------------------------------------------
@app.route('/admin/profile', methods=['GET'])
@admin_login_required
def admin_get_profile():
    admin = fetch_one("SELECT id, username, email, role, created_at FROM users WHERE id = %s", (session['admin_id'],))
    if not admin:
        return jsonify({"success": False, "error": "Admin not found"}), 404
    if admin.get('created_at'):
        admin['created_at'] = admin['created_at'].isoformat()
    return jsonify({"success": True, "profile": admin})

@app.route('/admin/profile', methods=['PUT'])
@admin_login_required
def admin_update_profile():
    data = request.get_json()
    email = data.get('email')
    username = data.get('username')
    
    if email or username:
        # In a real scenario, check for duplicates before updating
        execute_query("UPDATE users SET email = COALESCE(%s, email), username = COALESCE(%s, username) WHERE id = %s",
                      (email, username, session['admin_id']))
    return jsonify({"success": True, "message": "Profile updated"})

@app.route('/admin/profile/change_password', methods=['POST'])
@admin_login_required
def admin_profile_change_password():
    admin = fetch_one("SELECT password_hash FROM users WHERE id = %s", (session['admin_id'],))
    if not admin:
        return jsonify({"success": False, "error": "Admin not found"}), 404
    data = request.get_json()
    old_pw = data.get('old_password')
    new_pw = data.get('new_password')
    if not verify_user_password(old_pw, admin['password_hash']):
        return jsonify({"success": False, "error": "Old password incorrect"}), 400
    
    execute_query("UPDATE users SET password_hash = %s WHERE id = %s", (hash_user_password(new_pw), session['admin_id']))
    return jsonify({"success": True, "message": "Password changed"})

@app.route('/admin/profile/upload_picture', methods=['POST'])
@admin_login_required
def admin_upload_picture():
    # Stub: accept file but not store
    if 'picture' not in request.files:
        return jsonify({"success": False, "error": "No picture uploaded"}), 400
    # In real app, save and update profile
    return jsonify({"success": True, "message": "Profile picture uploaded (stub)"})

@app.route('/admin/profile/login_history', methods=['GET'])
@admin_login_required
def admin_login_history():
    # Stub: return empty list or sample data
    history = []
    return jsonify({"success": True, "login_history": history})

# -----------------------------------------------------------------
# Security Management Endpoints
# -----------------------------------------------------------------
@app.route('/admin/security/failed_logins', methods=['GET'])
@admin_login_required
def admin_failed_logins():
    return jsonify({"success": True, "failed_logins": security['failed_logins']})

@app.route('/admin/security/block_ip', methods=['POST'])
@admin_login_required
def admin_block_ip():
    data = request.get_json()
    ip = data.get('ip')
    if ip:
        security['blocked_ips'].append(ip)
        return jsonify({"success": True, "message": f"IP {ip} blocked"})
    return jsonify({"success": False, "error": "IP not provided"}), 400

@app.route('/admin/security/sessions', methods=['GET'])
@admin_login_required
def admin_active_sessions():
    return jsonify({"success": True, "sessions": security['active_sessions']})

@app.route('/admin/security/enable_2fa', methods=['POST'])
@admin_login_required
def admin_enable_2fa():
    admin = fetch_one("SELECT id FROM users WHERE id = %s AND role = 'admin'", (session['admin_id'],))
    if admin:
        return jsonify({"success": True, "message": "2FA enabled (stub)"})
    return jsonify({"success": False, "error": "Admin not found"}), 404

@app.route('/admin/security/audit_logs', methods=['GET'])
@admin_login_required
def admin_audit_logs():
    # Return admin action logs – using same logs list for prototype
    return jsonify({"success": True, "audit_logs": logs})

# -----------------------------------------------------------------
# Role & Permission Management Endpoints
# -----------------------------------------------------------------
@app.route('/admin/roles', methods=['GET'])
@admin_login_required
def admin_list_roles():
    result = []
    for role_name, info in roles.items():
        result.append({"role": role_name, "permissions": info.get('permissions')})
    return jsonify({"success": True, "roles": result})

@app.route('/admin/roles', methods=['POST'])
@admin_login_required
def admin_create_role():
    data = request.get_json()
    role_name = data.get('role')
    perms = data.get('permissions', [])
    if role_name in roles:
        return jsonify({"success": False, "error": "Role already exists"}), 400
    roles[role_name] = {"permissions": perms}
    return jsonify({"success": True, "message": f"Role {role_name} created"})

@app.route('/admin/roles/<role_name>', methods=['PUT'])
@admin_login_required
def admin_update_role(role_name):
    data = request.get_json()
    if role_name not in roles:
        return jsonify({"success": False, "error": "Role not found"}), 404
    roles[role_name]['permissions'] = data.get('permissions', roles[role_name]['permissions'])
    return jsonify({"success": True, "message": f"Role {role_name} updated"})

# -----------------------------------------------------------------
# System Settings Endpoints
# -----------------------------------------------------------------
@app.route('/admin/settings', methods=['GET'])
@admin_login_required
def admin_get_settings():
    return jsonify({"success": True, "settings": system_settings})

@app.route('/admin/settings', methods=['PUT'])
@admin_login_required
def admin_update_settings():
    data = request.get_json()
    system_settings.update(data)
    return jsonify({"success": True, "message": "Settings updated"})

# -----------------------------------------------------------------
# Platform Management Endpoints
# -----------------------------------------------------------------
@app.route('/admin/platforms', methods=['GET'])
@admin_login_required
def admin_list_platforms():
    result = []
    for pid, plat in platforms.items():
        p = plat.copy()
        p['id'] = pid
        result.append(p)
    return jsonify({"success": True, "platforms": result})

@app.route('/admin/platforms', methods=['POST'])
@admin_login_required
def admin_add_platform():
    data = request.get_json()
    pid = str(uuid.uuid4())
    platforms[pid] = {
        "name": data.get('name'),
        "enabled": data.get('enabled', True),
        "extraction_rules": data.get('extraction_rules', {}),
        "scan_count": 0
    }
    return jsonify({"success": True, "platform_id": pid})

@app.route('/admin/platforms/<platform_id>', methods=['PATCH'])
@admin_login_required
def admin_update_platform(platform_id):
    data = request.get_json()
    plat = platforms.get(platform_id)
    if not plat:
        return jsonify({"success": False, "error": "Platform not found"}), 404
    plat.update({k: v for k, v in data.items() if k in ['name', 'enabled', 'extraction_rules']})
    return jsonify({"success": True, "message": "Platform updated"})

# -----------------------------------------------------------------
# Database Management Endpoints
# -----------------------------------------------------------------
@app.route('/admin/database/backup', methods=['POST'])
@admin_login_required
def admin_database_backup():
    # Stub: create a dummy zip file in memory
    backup_content = b"dummy backup data"
    return app.response_class(
        backup_content,
        mimetype='application/zip',
        headers={"Content-Disposition": "attachment;filename=database_backup.zip"}
    )

@app.route('/admin/database/restore', methods=['POST'])
@admin_login_required
def admin_database_restore():
    if 'backup_file' not in request.files:
        return jsonify({"success": False, "error": "No backup file provided"}), 400
    # Stub: accept file and pretend to restore
    return jsonify({"success": True, "message": "Database restored (stub)"})

@app.route('/admin/database/stats', methods=['GET'])
@admin_login_required
def admin_database_stats():
    users_count_row = fetch_one("SELECT COUNT(*) as count FROM users")
    products_count_row = fetch_one("SELECT COUNT(*) as count FROM products")
    reviews_count_row = fetch_one("SELECT COUNT(*) as count FROM reviews")
    stats = {
        "size_mb": 12.5,
        "users": users_count_row['count'] if users_count_row else 0,
        "products": products_count_row['count'] if products_count_row else 0,
        "reviews": reviews_count_row['count'] if reviews_count_row else 0
    }
    return jsonify({"success": True, "stats": stats})

@app.route('/admin/database/optimize', methods=['POST'])
@admin_login_required
def admin_database_optimize():
    # Stub: pretend to run VACUUM or similar
    return jsonify({"success": True, "message": "Database optimized (stub)"})

# -----------------------------------------------------------------
# System Logs Endpoints
# -----------------------------------------------------------------
@app.route('/admin/logs', methods=['GET'])
@admin_login_required
def admin_get_logs():
    # Filter by level or date (stub)
    level = request.args.get('level')
    result = [l for l in logs if not level or l.get('level') == level]
    return jsonify({"success": True, "logs": result})

@app.route('/admin/logs/clear', methods=['POST'])
@admin_login_required
def admin_clear_logs():
    # Clear logs older than a given days parameter (stub clears all)
    logs.clear()
    return jsonify({"success": True, "message": "All logs cleared"})

# -----------------------------------------------------------------
# Feedback Management Endpoints
# -----------------------------------------------------------------
@app.route('/admin/feedback', methods=['GET'])
@admin_login_required
def admin_list_feedback():
    status = request.args.get('status')
    result = [f for f in feedback if not status or f.get('status') == status]
    return jsonify({"success": True, "feedback": result})

@app.route('/admin/feedback/<fb_id>/reply', methods=['POST'])
@admin_login_required
def admin_reply_feedback(fb_id):
    payload = request.get_json()
    reply = payload.get('reply')
    for fb in feedback:
        if fb.get('id') == fb_id:
            fb['reply'] = reply
            return jsonify({"success": True, "message": "Reply saved"})
    return jsonify({"success": False, "error": "Feedback not found"}), 404

@app.route('/admin/feedback/<fb_id>/resolve', methods=['PATCH'])
@admin_login_required
def admin_resolve_feedback(fb_id):
    for fb in feedback:
        if fb.get('id') == fb_id:
            fb['status'] = 'resolved'
            return jsonify({"success": True, "message": "Feedback resolved"})
    return jsonify({"success": False, "error": "Feedback not found"}), 404

@app.route('/admin/feedback/<fb_id>/export', methods=['GET'])
@admin_login_required
def admin_export_feedback(fb_id):
    fb = next((f for f in feedback if f.get('id') == fb_id), None)
    if not fb:
        return jsonify({"success": False, "error": "Feedback not found"}), 404
    csv_content = f"id,user_id,content,status,reply\n{fb_id},{fb.get('user_id','')},{fb.get('content','')},{fb.get('status','')},{fb.get('reply','')}"
    return app.response_class(csv_content, mimetype='text/csv', headers={"Content-Disposition": f"attachment;filename=feedback_{fb_id}.csv"})

# -----------------------------------------------------------------
# Notification Management Endpoints
# -----------------------------------------------------------------
@app.route('/admin/notifications/send', methods=['POST'])
@admin_login_required
def admin_send_notification():
    payload = request.get_json()
    title = payload.get('title')
    message = payload.get('message')
    target = payload.get('target', 'all')
    nid = str(uuid.uuid4())
    notifications.append({
        "id": nid,
        "title": title,
        "message": message,
        "target": target,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    })
    return jsonify({"success": True, "notification_id": nid})

@app.route('/admin/notifications/history', methods=['GET'])
@admin_login_required
def admin_notification_history():
    # Optional filter by target
    tgt = request.args.get('target')
    result = [n for n in notifications if not tgt or n.get('target') == tgt]
    return jsonify({"success": True, "notifications": result})

# -----------------------------------------------------------------
# Analytics Dashboard Endpoints
# -----------------------------------------------------------------
@app.route('/admin/analytics/fake_trends', methods=['GET'])
@admin_login_required
def analytics_fake_trends():
    # Stub: return dummy time series data
    data = [{"date": "2026-07-01", "fake_pct": 12}, {"date": "2026-07-08", "fake_pct": 15}]
    return jsonify({"success": True, "data": data})

@app.route('/admin/analytics/scan_stats', methods=['GET'])
@admin_login_required
def analytics_scan_stats():
    # Return daily/weekly/monthly counts (stub)
    data = {"daily": 120, "weekly": 750, "monthly": 3000}
    return jsonify({"success": True, "data": data})

@app.route('/admin/analytics/platform_comparison', methods=['GET'])
@admin_login_required
def analytics_platform_comparison():
    # Stub comparison data
    data = []
    for pid, plat in platforms.items():
        data.append({"platform": plat.get('name'), "scans": plat.get('scan_count', 0)})
    return jsonify({"success": True, "data": data})

@app.route('/admin/analytics/user_activity', methods=['GET'])
@admin_login_required
def analytics_user_activity():
    # Stub user activity stats
    data = {"new_users_last_week": 25, "active_users_last_day": 150}
    return jsonify({"success": True, "data": data})

# -----------------------------------------------------------------
# AI Model Management Endpoints
# -----------------------------------------------------------------
@app.route('/admin/ai/status', methods=['GET'])
@admin_login_required
def admin_ai_status():
    evaluation = model_evaluation_summary()
    status = {
        "model_version": evaluation['model_version'],
        "accuracy": evaluation['test_accuracy'],
        "last_trained": evaluation['evaluated_at'],
        "evaluation": evaluation
    }
    return jsonify({"success": True, "ai_status": status})

@app.route('/admin/ai/upload', methods=['POST'])
@admin_login_required
def admin_ai_upload():
    # Expect a file upload named 'model_file'
    if 'model_file' not in request.files:
        return jsonify({"success": False, "error": "No file provided"}), 400
    # In prototype, we just acknowledge receipt
    file = request.files['model_file']
    # Normally save and load the model
    return jsonify({"success": True, "message": f"Model {file.filename} received (stub)"})

@app.route('/admin/ai/retrain', methods=['POST'])
@service_auth_required
def admin_ai_retrain():
    import subprocess
    try:
        script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'train_model.py')
        result = subprocess.run([sys.executable, script_path], capture_output=True, text=True)
        if result.returncode != 0:
            app.logger.error('Model retraining exited with code %s: %s', result.returncode, result.stderr[:300])
            return jsonify({"success": False, "error": "Model training did not complete."}), 500

        # Reload the classifier globally so changes take effect
        global classifier
        from models.classifier import FakeReviewClassifier
        classifier = FakeReviewClassifier()

        # Read the saved training metrics
        metrics = load_training_metrics()
        if not metrics:
            return jsonify({"success": False, "error": "Training completed without a valid held-out evaluation."}), 500

        return jsonify({"success": True, "message": "Model retrained successfully!", "metrics": metrics})
    except Exception:
        app.logger.exception('Model retraining failed')
        return jsonify({"success": False, "error": "Model retraining failed"}), 500

@app.route('/admin/ai/test', methods=['POST'])
@admin_login_required
def admin_ai_test():
    payload = request.get_json()
    if not payload or 'text' not in payload:
        return jsonify({"success": False, "error": "No text to test"}), 400
    text = payload['text']
    cleaned = cleaner.clean_text(text)
    is_fake, confidence, reasons = classifier.predict(text, cleaned)
    is_fake, confidence, reasons, classification = _normalize_probability_classification(
        is_fake, confidence, reasons
    )
    return jsonify({
        "success": True,
        "result": {
            "is_fake": is_fake,
            "confidence": confidence,
            "classification": classification,
            "reasons": reasons
        }
    })

@app.route('/admin/ai/logs', methods=['GET'])
@admin_login_required
def admin_ai_logs():
    # Return recent processing logs – placeholder
    recent = logs[-100:]
    return jsonify({"success": True, "logs": recent})

# -----------------------------------------------------------------
# Community Reports Management Endpoints
# -----------------------------------------------------------------
@app.route('/admin/community', methods=['GET'])
@admin_login_required
def admin_list_community_reports():
    status = request.args.get('status')
    result = []
    for rpt in community_reports:
        if status and rpt.get('status') != status:
            continue
        result.append(rpt)
    return jsonify({"success": True, "reports": result})

@app.route('/admin/community/<report_id>', methods=['GET'])
@admin_login_required
def admin_get_community_report(report_id):
    rpt = next((r for r in community_reports if r.get('id') == report_id), None)
    if not rpt:
        return jsonify({"success": False, "error": "Report not found"}), 404
    return jsonify({"success": True, "report": rpt})

@app.route('/admin/community/<report_id>/approve', methods=['POST'])
@admin_login_required
def admin_approve_community_report(report_id):
    for rpt in community_reports:
        if rpt.get('id') == report_id:
            rpt['status'] = 'approved'
            return jsonify({"success": True, "message": "Report approved"})
    return jsonify({"success": False, "error": "Report not found"}), 404

@app.route('/admin/community/<report_id>/reject', methods=['POST'])
@admin_login_required
def admin_reject_community_report(report_id):
    for rpt in community_reports:
        if rpt.get('id') == report_id:
            rpt['status'] = 'rejected'
            return jsonify({"success": True, "message": "Report rejected"})
    return jsonify({"success": False, "error": "Report not found"}), 404

@app.route('/admin/community/<report_id>/resolve', methods=['POST'])
@admin_login_required
def admin_resolve_community_report(report_id):
    for rpt in community_reports:
        if rpt.get('id') == report_id:
            rpt['status'] = 'resolved'
            return jsonify({"success": True, "message": "Report marked as resolved"})
    return jsonify({"success": False, "error": "Report not found"}), 404

@app.route('/admin/community/<report_id>', methods=['DELETE'])
@admin_login_required
def admin_delete_community_report(report_id):
    global community_reports
    before = len(community_reports)
    community_reports = [r for r in community_reports if r.get('id') != report_id]
    if len(community_reports) < before:
        return jsonify({"success": True, "message": "Report deleted"})
    return jsonify({"success": False, "error": "Report not found"}), 404

# -----------------------------------------------------------------
# Review Management Endpoints
# -----------------------------------------------------------------
@app.route('/admin/reviews', methods=['GET'])
@admin_login_required
def admin_list_reviews():
    # Filters: product_id, is_fake, trust_score range
    product_id = request.args.get('product_id')
    fake_filter = request.args.get('is_fake')
    result = []
    for rid, rev in reviews.items():
        if product_id and rev.get('product_id') != product_id:
            continue
        if fake_filter is not None:
            if fake_filter.lower() == 'true' and not rev.get('is_fake'):
                continue
            if fake_filter.lower() == 'false' and rev.get('is_fake'):
                continue
        rev_copy = rev.copy()
        rev_copy['id'] = rid
        result.append(rev_copy)
    return jsonify({"success": True, "reviews": result})

@app.route('/admin/reviews/<review_id>', methods=['GET'])
@admin_login_required
def admin_get_review(review_id):
    rev = reviews.get(review_id)
    if not rev:
        return jsonify({"success": False, "error": "Review not found"}), 404
    rev_copy = rev.copy()
    rev_copy['id'] = review_id
    return jsonify({"success": True, "review": rev_copy})

@app.route('/admin/reviews/<review_id>', methods=['DELETE'])
@admin_login_required
def admin_delete_review(review_id):
    if review_id in reviews:
        del reviews[review_id]
        return jsonify({"success": True, "message": "Review deleted"})
    return jsonify({"success": False, "error": "Review not found"}), 404

# -----------------------------------------------------------------
# Product Management Endpoints
# -----------------------------------------------------------------
@app.route('/admin/products', methods=['GET'])
@admin_login_required
def admin_list_products():
    # Optional filters: platform, search
    platform = request.args.get('platform')
    search = request.args.get('search', '').lower()
    result = []
    for pid, prod in products.items():
        if platform and prod.get('platform') != platform:
            continue
        if search and search not in prod.get('name', '').lower():
            continue
        prod_copy = prod.copy()
        prod_copy['id'] = pid
        result.append(prod_copy)
    return jsonify({"success": True, "products": result})

@app.route('/admin/products/<product_id>', methods=['GET'])
@admin_login_required
def admin_get_product(product_id):
    prod = products.get(product_id)
    if not prod:
        return jsonify({"success": False, "error": "Product not found"}), 404
    prod_copy = prod.copy()
    prod_copy['id'] = product_id
    return jsonify({"success": True, "product": prod_copy})

@app.route('/admin/products/<product_id>', methods=['DELETE'])
@admin_login_required
def admin_delete_product(product_id):
    if product_id in products:
        del products[product_id]
        return jsonify({"success": True, "message": "Product deleted"})
    return jsonify({"success": False, "error": "Product not found"}), 404

@app.route('/admin/products/<product_id>/export', methods=['GET'])
@admin_login_required
def admin_export_product(product_id):
    # Stub: return CSV of product data
    prod = products.get(product_id)
    if not prod:
        return jsonify({"success": False, "error": "Product not found"}), 404
    csv_content = f"id,name,trust_score,fake_pct,platform\n{product_id},{prod.get('name','')},{prod.get('trust_score',0)},{prod.get('fake_pct',0)},{prod.get('platform','')}"
    return app.response_class(
        csv_content,
        mimetype='text/csv',
        headers={"Content-Disposition": f"attachment;filename=product_{product_id}.csv"}
    )

# -----------------------------------------------------------------
# In‑memory data stores for other admin features (prototype)
# -----------------------------------------------------------------
products = {}
# Example product: {product_id: {"id": ..., "name": ..., "trust_score": ..., "fake_pct": ..., "platform": ...}}

reviews = {}
# Example review: {review_id: {"id": ..., "product_id": ..., "is_fake": ..., "analysis": {...}}}

community_reports = []
# Each report: {"id": ..., "user_id": ..., "status": "pending"|"approved"|"rejected", "details": ...}

notifications = []
# Each notification: {"id": ..., "title": ..., "message": ..., "target": "all"|"user_id", "timestamp": ...}

feedback = []
# Each feedback: {"id": ..., "user_id": ..., "content": ..., "status": "open"|"resolved", "reply": None}

platforms = {}
# Example platform config: {platform_id: {"name": ..., "enabled": bool, "extraction_rules": {...}}}

system_settings = {
    "system_name": "EchoTrace",
    "logo_url": "",
    "theme": "dark",
    "language": "en",
    "timezone": "UTC",
    "ai_confidence_threshold": 0.8,
    "trust_score_threshold": 70,
    "scan_limit": 1000,
    "security_policy": {
        "password_min_length": 8,
        "session_timeout_minutes": 30,
        "api_keys": []
    }
}

roles = {
    "superadmin": {"permissions": ["all"]},
    "admin": {"permissions": [
        "user_management", "product_management", "review_management",
        "community_reports", "ai_model", "analytics", "notifications",
        "feedback", "system_logs", "database", "platforms", "settings", "security"
    ]}
}

security = {
    "failed_logins": [],
    "blocked_ips": [],
    "active_sessions": []
}

logs = []

def detect_review_language(text):
    """Small deterministic labeler for UI context; it never changes model classification."""
    lowered = str(text or '').lower()
    tagalog_markers = ('ang', 'ng', 'mga', 'ito', 'hindi', 'salamat', 'maganda', 'ganda', 'pero', 'sobrang', ' po ', ' naman ')
    english_markers = (' the ', ' and ', ' is ', ' this ', ' product ', ' good ', ' very ', ' with ')
    tagalog_hits = sum(1 for marker in tagalog_markers if marker in f' {lowered} ')
    english_hits = sum(1 for marker in english_markers if marker in f' {lowered} ')
    if tagalog_hits and english_hits:
        return 'Taglish'
    if tagalog_hits:
        return 'Tagalog'
    return 'English'


@app.route('/ocr/extract', methods=['POST'])
@service_auth_required
def ocr_extract():
    """Extract candidate review text from uploaded screenshots only.

    This endpoint intentionally does not invoke the classifier or persist any
    data. The user-facing PHP route returns these candidates for confirmation;
    the existing analysis route remains the only path that saves a scan.
    """
    files = []
    for key, file_storage in request.files.items(multi=True):
        if key == 'screenshots' or key == 'screenshots[]' or key.startswith('screenshots['):
            files.append(file_storage)
    if not files:
        return jsonify({'success': False, 'error_code': 'ocr_upload_missing', 'error': 'No screenshots were uploaded.'}), 422
    if len(files) > 5:
        return jsonify({'success': False, 'error_code': 'ocr_upload_limit', 'error': 'A maximum of 5 screenshots can be processed at once.'}), 422

    platform = request.form.get('platform') or 'auto'
    title = request.form.get('title') or ''
    result = extract_screenshot_reviews(files, platform[:32], title[:255])
    if not result.get('success'):
        return jsonify(result), 503 if result.get('error_code') == 'ocr_unavailable' else 422
    return jsonify(result)


@app.route('/analyze', methods=['POST'])
@service_auth_required
def analyze():
    start_time = time.time()
    data = request.get_json()

    if not data or 'reviews' not in data:
        return jsonify({"success": False, "error": "No reviews provided"}), 400

    input_reviews = data['reviews']
    analysis_options = data.get('options') if isinstance(data.get('options'), dict) else {}
    detect_duplicates = analysis_options.get('detect_duplicates', True) is not False
    show_explanations = analysis_options.get('show_explanations', True) is not False
    detect_language = analysis_options.get('detect_language', True) is not False
    if not isinstance(input_reviews, list) or len(input_reviews) == 0:
        return jsonify({"success": False, "error": "Reviews must be a non-empty list"}), 400
    if len(input_reviews) > 100:
        return jsonify({"success": False, "error": "A maximum of 100 reviews is allowed per request"}), 400
    if not classifier.is_ready:
        return jsonify({"success": False, "error": "Trained model artifacts are unavailable"}), 503

    results = []
    cleaned_texts = []
    fake_count = 0
    genuine_count = 0
    uncertain_count = 0
    total_reviews = len(input_reviews)
    contexts = []

    # Validate and clean once before running NLP/model work. This lets the
    # classifier vectorize cache misses in one batch without changing inputs.
    for index, rev in enumerate(input_reviews):
        if not isinstance(rev, dict):
            return jsonify({"success": False, "error": f"Review {index} must be an object"}), 400
        rev_id = rev.get('id')
        text = rev.get('text', '')
        if not isinstance(text, str) or not text.strip():
            return jsonify({"success": False, "error": f"Review {index} has empty or invalid text"}), 400
        if len(text) > 10000:
            return jsonify({"success": False, "error": f"Review {index} exceeds 10000 characters"}), 400
        text = text.strip()
        try:
            rating = float(rev.get('rating', 0) or 0)
        except (TypeError, ValueError):
            return jsonify({"success": False, "error": f"Review {index} has an invalid rating"}), 400
        if rating and not 1 <= rating <= 5:
            return jsonify({"success": False, "error": f"Review {index} rating must be between 1 and 5"}), 400
        cleaned = cleaner.clean_text(text)
        contexts.append({
            'id': rev_id,
            'text': text,
            'rating': rating,
            'author': str(rev.get('author', 'Anonymous'))[:200],
            'cleaned': cleaned,
        })
        cleaned_texts.append(cleaned)

    predictions: list[tuple[int, float, list[str]] | None] = [None] * total_reviews
    cache_misses = {}
    prediction_cache_hits = 0
    for index, context in enumerate(contexts):
        key = _prediction_cache_key(context['text'], context['cleaned'])
        cached = _prediction_cache_get(key)
        if cached is not None:
            predictions[index] = cached
            prediction_cache_hits += 1
        else:
            cache_misses.setdefault(key, []).append(index)

    if cache_misses:
        miss_indices = [indices[0] for indices in cache_misses.values()]
        try:
            batch_predictions = classifier.predict_batch(
                [contexts[index]['text'] for index in miss_indices],
                [contexts[index]['cleaned'] for index in miss_indices],
            )
        except RuntimeError as exc:
            return jsonify({"success": False, "error": str(exc)}), 503
        for key, prediction in zip(cache_misses.keys(), batch_predictions):
            _prediction_cache_put(key, prediction)
            for index in cache_misses[key]:
                predictions[index] = prediction

    # Run the remaining NLP signals once per validated review and combine them
    # with the batched/cached model predictions.
    for index, context in enumerate(contexts):
        text = context['text']
        cleaned = context['cleaned']
        rating = context['rating']
        rev_id = context['id']
        author = context['author']
        sentiment_score, sentiment_label = analyzer.analyze_sentiment(text)
        emotion = analyzer.detect_emotion(text)
        toxicity = analyzer.detect_toxicity(text)
        keywords = analyzer.extract_keywords(text, top_n=3)
        intent = analyzer.detect_intent(text)
        grammar_score = analyzer.analyze_grammar(text)
        prediction = predictions[index]
        if prediction is None:
            return jsonify({"success": False, "error": f"Prediction was not generated for review {index}"}), 503
        is_fake, confidence, reasons = prediction
        is_fake, confidence, reasons, classification = _normalize_probability_classification(
            is_fake, confidence, reasons
        )

        if classification == "Uncertain Review":
            uncertain_count += 1
            risk_level = "Medium Risk"
        elif classification == "Suspicious Review":
            fake_count += 1
            risk_level = "High Risk" if confidence >= 75.0 else "Medium Risk"
        else:
            genuine_count += 1
            risk_level = "Low Risk"

        results.append({
            "id": rev_id,
            "author": author,
            "text": text,
            "rating": rating,
            "cleaned_text": cleaned,
            "is_fake": is_fake,
            "confidence_score": confidence,
            "fake_probability": round(confidence / 100.0, 6),
            "genuine_probability": round(1.0 - (confidence / 100.0), 6),
            "fake_probability_percent": confidence,
            "genuine_probability_percent": round(100.0 - confidence, 2),
            "classification": classification,
            "risk_level": risk_level,
            "sentiment": sentiment_label,
            "emotion": emotion,
            "toxicity": toxicity,
            "duplicate_group_id": None, # Will be set below
            "keywords": keywords,
            "intent": intent,
            "grammar_score": grammar_score,
            "fake_reasons": reasons if show_explanations else [],
            "language": detect_review_language(text) if detect_language else None
        })

    # 4. Duplicate / Similarity Grouping
    duplicate_groups = analyzer.group_duplicates(cleaned_texts, threshold=0.8) if detect_duplicates else {}
    for idx, group_id in duplicate_groups.items():
        if group_id is not None:
            results[idx]["duplicate_group_id"] = group_id
            # Similarity is supporting context, never sufficient by itself to
            # reverse the trained model's prediction.
            if results[idx]["is_fake"]:
                results[idx]["fake_reasons"].append(
                    "This review is highly similar to another review in the inspected batch"
                )

    # 5. Product Trust Score Calculation
    # Formula: Likely Genuine % of analyzed reviews
    # Uncertain reviews are counted separately and NOT treated as genuine.
    # Trust score uses Genuine / (Genuine + Suspicious) * 100. Uncertain
    # reviews are excluded from the denominator and shown separately.
    # This is a classification summary of the analyzed sample, not a verified
    # authenticity probability. Toxicity is reported as a separate signal and
    # must not silently change the required trust-score formula.

    # Uncertain classification:
    # confidence_score = P(fake) × 100 (from classifier.py line 249)
    # So for a GENUINE prediction (is_fake=0), uncertainty means the fake-probability
    # is close to the decision boundary (around 50%).
    # For a FAKE prediction (is_fake=1), uncertainty means fake-probability is near 50%.
    # Uncertain band: fake-class probability between 40-60% regardless of predicted class.
    # Counts are assigned with each review so the three labels are mutually exclusive.

    # Effective genuine = reviews predicted genuine AND not in uncertain band
    # confidence_score = P(fake)*100. is_fake=0 with conf=27 means P(genuine)=73% — confidently genuine.
    effective_genuine = genuine_count
    qualifying_reviews = effective_genuine + fake_count
    trust_score_available = qualifying_reviews > 0
    genuine_pct = (effective_genuine / qualifying_reviews) if trust_score_available else 0.0
    trust_score = genuine_pct * 100.0
    trust_score = round(max(min(trust_score, 100.0), 0.0), 2)

    # Caveat: small samples are less reliable
    sample_warning = total_reviews <= 5

    # Calculate overall risk level
    if not trust_score_available:
        overall_risk_level = "Not evaluated"
    elif trust_score >= 80.0:
        overall_risk_level = "Low Risk"
    elif trust_score >= 50.0:
        overall_risk_level = "Medium Risk"
    else:
        overall_risk_level = "High Risk"

    # 6. Extract Strengths, Weaknesses, and buying recommendations
    strengths = []
    weaknesses = []
    
    # Lexicons for strengths and weaknesses
    strength_keywords = {
        'durable': 'Good build quality / Durability',
        'fast': 'Fast delivery / Quick shipping',
        'easy': 'Easy to use / User-friendly',
        'perfect': 'Excellent fit and finish',
        'great': 'High general satisfaction',
        'valuable': 'Great value for money'
    }
    weakness_keywords = {
        'cheap': 'Materials feel cheap',
        'battery': 'Battery life is short',
        'broken': 'Defective or easily broken',
        'slow': 'Slow shipping or delayed arrival',
        'useless': 'Poor utility / doesn\'t work',
        'expensive': 'Overpriced for what it offers'
    }
    
    # Simple rule based summary
    combined_cleaned_text = " ".join(cleaned_texts).lower()
    for kw, val in strength_keywords.items():
        if kw in combined_cleaned_text:
            strengths.append(val)
    for kw, val in weakness_keywords.items():
        if kw in combined_cleaned_text:
            weaknesses.append(val)
            
    # Fallback default values
    if not strengths:
        strengths.append("Generally acceptable build quality")
    if not weaknesses:
        weaknesses.append("No common critical complaints found")

    # Limit to top 3
    strengths = strengths[:3]
    weaknesses = weaknesses[:3]

    # Generate recommendation based on trust score
    if not trust_score_available:
        recommendation = "Insufficient evidence. The submitted sample contains no confidently genuine or suspicious reviews after excluding uncertain results."
    elif trust_score >= 80:
        recommendation = "Lower risk in this inspected sample. The model produced relatively few flags; this is not a verification of product authenticity."
    elif trust_score >= 60:
        recommendation = "Use caution. Some reviews in the inspected sample were model-flagged; consider additional evidence before deciding."
    elif trust_score >= 40:
        recommendation = "Mixed sample result. A moderate number of reviews were model-flagged; manual review is recommended."
    else:
        recommendation = "Higher sample risk. A significant portion of inspected reviews were model-flagged; this is not proof of manipulation."

    # Calculate Overall Product Quality based on genuine reviews rating
    genuine_ratings = [r['rating'] for r in results if r['classification'] == 'Genuine Review' and r['rating'] > 0]
    if genuine_ratings:
        avg_genuine_rating = sum(genuine_ratings) / len(genuine_ratings)
        if avg_genuine_rating >= 4.5:
            overall_quality = "Excellent"
        elif avg_genuine_rating >= 3.5:
            overall_quality = "Good"
        elif avg_genuine_rating >= 2.5:
            overall_quality = "Average"
        elif avg_genuine_rating >= 1.5:
            overall_quality = "Fair"
        else:
            overall_quality = "Poor"
    else:
        avg_genuine_rating = 0.0
        overall_quality = "Unknown (No genuine reviews)"

    # Generate Summary of Genuine Reviews
    if genuine_ratings:
        genuine_sentiments = [r['sentiment'] for r in results if r['classification'] == 'Genuine Review']
        pos_pct = (genuine_sentiments.count('positive') / len(genuine_sentiments)) * 100 if genuine_sentiments else 0
        
        strength_phrase = f"highlighting strengths like {', '.join(strengths).lower()}" if strengths else "with general feedback"
        genuine_summary = f"Genuine reviews present a {overall_quality.lower()} profile ({avg_genuine_rating:.1f}/5.0 stars), {strength_phrase}. Approximately {pos_pct:.0f}% of genuine users expressed positive sentiment."
    else:
        genuine_summary = "No genuine reviews were identified in this scan to generate a summary."

    # 7. Attach RAG Policy Explainability & Product Synthesis
    for rev in results:
        rev["rag_explanation"] = rag_pipeline.explain_review(
            review_text=rev["text"],
            is_fake=bool(rev["is_fake"]),
            confidence=float(rev["confidence_score"]),
            reasons=rev.get("fake_reasons", [])
        ) if show_explanations else None

    product_name = data.get('product_title') or data.get('title') or 'Scanned Product'
    rag_synthesis = rag_pipeline.synthesize_product_audit(
        product_title=product_name,
        total_reviews=total_reviews,
        fake_count=fake_count,
        trust_score=trust_score
    )

    duration_ms = int((time.time() - start_time) * 1000)

    return jsonify({
        "success": True,
        "results": results,
        "trust_score": trust_score,
        "trust_score_available": trust_score_available,
        "overall_risk_level": overall_risk_level,
        "rag_synthesis": rag_synthesis,
        "summary": {
            "strengths": strengths,
            "weaknesses": weaknesses,
            "recommendation": recommendation,
            "overall_quality": overall_quality,
            "genuine_summary": genuine_summary
        },
        "metrics": {
            "total_scanned": total_reviews,
            "fake_detected": fake_count,
            "genuine_detected": effective_genuine,
            "uncertain_detected": uncertain_count,
            "trust_score_available": trust_score_available,
            "trust_score_denominator": qualifying_reviews,
            "sample_warning": sample_warning,
            "score_note": (
                f"Based on {total_reviews} analyzed review{'s' if total_reviews != 1 else ''}. "
                f"Genuine: {effective_genuine}, Fake: {fake_count}, Uncertain: {uncertain_count}. "
                "This score reflects the classified sample only."
            ),
            "duration_ms": duration_ms,
            "prediction_cache_hits": prediction_cache_hits,
            "prediction_cache_misses": len(cache_misses),
            "prediction_batch_size": len(cache_misses)
        }
    })

@app.route('/retrain', methods=['POST'])
@service_auth_required
def retrain():
    """Retrain by delegating to train_model.py so model + vectorizer stay in sync."""
    import subprocess, json as _json
    try:
        script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'train_model.py')
        result = subprocess.run([sys.executable, script_path], capture_output=True, text=True)
        if result.returncode != 0:
            return jsonify({"success": False, "error": result.stderr[:300]}), 500

        # Reload classifier so new pkl files are used immediately
        global classifier
        from models.classifier import FakeReviewClassifier
        classifier = FakeReviewClassifier()

        return jsonify({"success": True, "message": "Model retrained and reloaded successfully."})
    except Exception:
        app.logger.exception('Model retraining failed')
        return jsonify({"success": False, "error": "Model retraining failed"}), 500

# Admin report generation endpoints
@app.route('/admin/report/<report_type>', methods=['GET'])
@admin_login_required
def generate_report(report_type):
    fmt = request.args.get('fmt', 'pdf').lower()
    data_funcs = {
        'fake_review': get_fake_review_report_data,
        'product_trust': get_product_trust_report_data,
        'user_activity': get_user_activity_report_data,
        'monthly': get_monthly_report_data,
        'ai_performance': get_ai_performance_report_data,
    }
    if report_type not in data_funcs:
        return jsonify({"success": False, "error": "Invalid report type"}), 400
    df = data_funcs[report_type]()
    title = report_type.replace('_', ' ').title() + " Report"
    try:
        file_bytes = export_report(df, title, fmt=fmt)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

    if fmt == 'pdf':
        mime = 'application/pdf'
        ext = 'pdf'
    elif fmt == 'excel':
        mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ext = 'xlsx'
    else:
        return jsonify({"success": False, "error": "Unsupported format"}), 400

    response = app.response_class(
        file_bytes,
        mimetype=mime,
        direct_passthrough=True
    )
    response.headers.set('Content-Disposition', 'attachment', filename=f"{report_type}_report.{ext}")
    return response

if __name__ == '__main__':
    # This service is intentionally loopback-only; the PHP API is its public
    # boundary. Never run the Flask debugger for the deployed application.
    app.run(host=os.environ.get('ECHOTRACE_AI_HOST', '127.0.0.1'),
            port=int(os.environ.get('ECHOTRACE_AI_PORT', '5000')),
            debug=False)
