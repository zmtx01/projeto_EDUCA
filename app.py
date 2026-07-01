# -*- coding: utf-8 -*-

from flask import Flask, jsonify, request, render_template, redirect, url_for, make_response, send_from_directory
from werkzeug.exceptions import NotFound
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from flask_cors import CORS
import jwt
import os
import psycopg2
import bcrypt
import tempfile
import shutil
import zipfile 
from datetime import datetime, timedelta, UTC

load_dotenv()

app = Flask(__name__)
app.json.ensure_ascii = False
CORS(app)

# --- Configurações de Upload de Arquivos ---
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# --- Obtenção de Variáveis de Ambiente ---
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "educa_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD")
SECRET_KEY = os.getenv("SECRET_KEY")

if not SECRET_KEY:
    raise ValueError("Chave secreta (SECRET_KEY) não definida no arquivo .env.")
if not DB_PASSWORD:
    raise ValueError("Senha do banco de dados (DB_PASSWORD) não definida no arquivo .env.")

# --- Funções Auxiliares de Segurança e Banco de Dados ---

def get_db_connection():
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
        return conn
    except psycopg2.Error as e:
        print(f"Erro de conexão com o banco: {e}")
        return None

def get_token_from_request():
    token = request.cookies.get('jwt_token')
    if not token:
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
    return token

def validate_token(token=None):
    if not token:
        token = get_token_from_request()
    if not token:
        return None
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except:
        return None

def validate_admin_token():
    payload = validate_token()
    if not payload or not payload.get('is_admin', False):
        return None
    return payload

# Resolve e higieniza subpastas para evitar travessia de diretório
def get_safe_path(subpath):
    if not subpath:
        return app.config['UPLOAD_FOLDER']
    safe_parts = [secure_filename(p) for p in subpath.split('/') if p.strip() and p.strip() != '..']
    return os.path.join(app.config['UPLOAD_FOLDER'], *safe_parts)

# --- Rotas para Servir Páginas HTML (Frontend) ---

@app.route('/')
def index():
    return redirect(url_for('login_page'))

@app.route('/login')
def login_page():
    token = request.cookies.get('jwt_token')
    if token and validate_token(token):
        return redirect(url_for('admin_page'))
    return render_template('login.html')

@app.route('/register')
def register_page():
    return render_template('register.html')

@app.route('/admin')
def admin_page():
    token = request.cookies.get('jwt_token')
    if not token or not validate_token(token):
        return redirect(url_for('login_page'))
    return render_template('admin.html')

@app.route('/admin_zmtx')
def admin_zmtx_page():
    token = request.cookies.get('jwt_token')
    if not token or not validate_token(token):
        return redirect(url_for('login_page'))
    return render_template('arquivos.html')

@app.route('/logout')
def logout():
    response = make_response(redirect(url_for('login_page')))
    response.set_cookie(
        'jwt_token',
        '',
        expires=0,
        httponly=True,
        secure=False, 
        samesite='Lax',
        path='/'
    )
    return response

# --- APIs de Gerenciamento de Arquivos e Pastas ---

# 1. LISTAR ARQUIVOS E PASTAS DENTRO DE UM CAMINHO
@app.route('/api/files', methods=['GET'])
def list_files():
    if not validate_token():
        return jsonify({"message": "Acesso negado."}), 403
    
    subpath = request.args.get('path', '')
    target_dir = get_safe_path(subpath)

    if not os.path.exists(target_dir):
        return jsonify({"message": "Pasta não encontrada."}), 404
    
    try:
        # CORRIGIDO: Agora usamos 'items' de forma consistente para evitar NameError
        items = os.listdir(target_dir)
        item_list = []
        for item in items:
            path = os.path.join(target_dir, item)
            if os.path.isdir(path):
                item_list.append({"name": item, "size": "-", "type": "directory"})
            elif os.path.isfile(path):
                size = round(os.path.getsize(path) / 1024, 2)
                item_list.append({"name": item, "size": f"{size} KB", "type": "file"})
        return jsonify(item_list), 200
    except Exception as e:
        return jsonify({"message": "Erro ao listar diretório."}), 500

# 2. CRIAR NOVA PASTA
@app.route('/api/create-folder', methods=['POST'])
def create_folder():
    if not validate_token():
        return jsonify({"message": "Acesso negado."}), 403
    
    data = request.get_json()
    subpath = data.get('path', '')
    folder_name = data.get('name', '').strip()

    if not folder_name:
        return jsonify({"message": "Nome da pasta inválido."}), 400
    
    safe_folder_name = secure_filename(folder_name)
    target_dir = os.path.join(get_safe_path(subpath), safe_folder_name)

    try:
        if os.path.exists(target_dir):
            return jsonify({"message": "Esta pasta já existe neste diretório."}), 409
        
        os.makedirs(target_dir, exist_ok=True)
        return jsonify({"message": "Pasta criada com sucesso!"}), 201
    except Exception as e:
        return jsonify({"message": "Erro ao criar pasta."}), 500

# 3. UPLOAD SEGURO DENTRO DE SUBPASTAS
@app.route('/api/upload', methods=['POST'])
def upload_file():
    if not validate_token():
        return jsonify({"message": "Acesso negado."}), 403

    if 'file' not in request.files:
        return jsonify({"message": "Nenhum arquivo enviado."}), 400

    file = request.files['file']
    subpath = request.form.get('path', '')

    if file.filename == '':
        return jsonify({"message": "Nome de arquivo inválido."}), 400

    filename = secure_filename(file.filename)
    target_dir = get_safe_path(subpath)
    final_path = os.path.join(target_dir, filename)

    try:
        temp_fd, temp_path = tempfile.mkstemp()
        with os.fdopen(temp_fd, 'wb') as temp_file:
            file.save(temp_file)

        if os.path.exists(final_path):
            os.remove(final_path)
        
        shutil.move(temp_path, final_path)
        return jsonify({"message": "Upload concluído com sucesso!"}), 200
    except Exception as e:
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({"message": f"Erro de gravação segura: {str(e)}"}), 500

# 4. DOWNLOAD DE ARQUIVOS E PASTAS (COMPACTANDO EM ZIP ON-THE-FLY)
@app.route('/api/download', methods=['GET'])
def download_file():
    if not validate_token():
        return jsonify({"message": "Acesso negado."}), 403
    
    name = request.args.get('name', '')
    subpath = request.args.get('path', '')
    
    safe_name = secure_filename(name)
    target_path = os.path.join(get_safe_path(subpath), safe_name)
    
    if not os.path.exists(target_path):
        return jsonify({"message": "Item não encontrado."}), 404
    
    if os.path.isdir(target_path):
        try:
            temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
            temp_zip.close()
            
            with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for root, dirs, files_in_dir in os.walk(target_path):
                    for file in files_in_dir:
                        file_path = os.path.join(root, file)
                        arc_name = os.path.relpath(file_path, target_path)
                        zip_file.write(file_path, arc_name)
            
            return send_from_directory(
                os.path.dirname(temp_zip.name),
                os.path.basename(temp_zip.name),
                as_attachment=True,
                download_name=f"{safe_name}.zip"
            )
        except Exception as e:
            return jsonify({"message": f"Erro ao compactar pasta: {str(e)}"}), 500
    else:
        return send_from_directory(os.path.dirname(target_path), safe_name, as_attachment=True)

# 5. DELETAR ARQUIVOS OU PASTAS
@app.route('/api/files', methods=['DELETE'])
def delete_item():
    if not validate_token():
        return jsonify({"message": "Acesso negado."}), 403

    filename = request.args.get('name', '')
    subpath = request.args.get('path', '')
    
    safe_name = secure_filename(filename)
    path = os.path.join(get_safe_path(subpath), safe_name)

    try:
        if os.path.exists(path):
            if os.path.isdir(path):
                shutil.rmtree(path)
            else:
                os.remove(path)
            return jsonify({"message": "Item excluído com sucesso."}), 200
        return jsonify({"message": "Item não encontrado."}), 404
    except Exception as e:
        return jsonify({"message": "Erro ao deletar item."}), 500

# --- APIs de Controle de Usuários e Servidor ---

@app.route('/init-db')
def init_db():
    conn = get_db_connection()
    if not conn:
        return jsonify({"message": "Erro de conexão com o banco."}), 500

    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"message": "Banco de dados inicializado (tabela 'users' verificada/criada)."}), 200
    except psycopg2.Error as e:
        print(f"Erro ao inicializar DB: {e}")
        return jsonify({"message": "Erro ao criar/verificar tabela no banco de dados."}), 500

@app.route('/api/register', methods=['POST'])
def register_user():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"message": "Usuário e senha são obrigatórios."}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"message": "Erro de conexão com o banco."}), 500

    try:
        cur = conn.cursor()
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        cur.execute(
            "INSERT INTO users (username, password_hash, is_admin) VALUES (%s, %s, TRUE)",
            (username, hashed_password)
        )
        conn.commit()
        return jsonify({"message": "Conta criada com sucesso! Faça login."}), 201
    except psycopg2.errors.UniqueViolation:
        return jsonify({"message": "Este nome de usuário já existe."}), 409
    except Exception as e:
        print(f"Erro: {e}")
        return jsonify({"message": "Erro ao criar conta."}), 500
    finally:
        if 'cur' in locals() and cur: cur.close()
        if conn: conn.close()

@app.route('/api/login', methods=['POST'])
def api_login_user():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"message": "Nome de usuário e senha são obrigatórios."}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"message": "Erro de conexão com o banco de dados."}), 500

    try:
        cur = conn.cursor()
        cur.execute("SELECT id, username, password_hash, is_admin FROM users WHERE username = %s", (username,))
        user = cur.fetchone()

        if user and bcrypt.checkpw(password.encode('utf-8'), user[2].encode('utf-8')):
            payload = {
                'user_id': user[0],
                'username': user[1],
                'is_admin': user[3],
                'exp': datetime.now(UTC) + timedelta(minutes=15)
            }
            token = jwt.encode(payload, SECRET_KEY, algorithm='HS256')

            response_data = jsonify({"message": "Login bem-sucedido!"})
            response = make_response(response_data)

            response.set_cookie(
                'jwt_token',
                token,
                httponly=True,
                secure=False, 
                samesite='Lax',
                path='/',
                max_age=None,
                expires=None
            )
            return response
        else:
            return jsonify({"message": "Credenciais inválidas."}), 401
    except Exception as e:
        print(f"Erro no login: {e}")
        return jsonify({"message": "Erro interno."}), 500
    finally:
        if 'cur' in locals() and cur: cur.close()
        if conn: conn.close()

@app.route('/api/me', methods=['GET'])
def get_current_user():
    token = request.cookies.get('jwt_token')
    if not token:
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]

    payload = validate_token(token)
    if not payload:
        return jsonify({"message": "Token inválido ou expirado."}), 401

    return jsonify({
        "user_id": payload['user_id'],
        "username": payload['username'],
        "is_admin": payload.get('is_admin', False)
    }), 200

@app.route('/users', methods=['GET'])
def get_users():
    if not validate_admin_token():
        return jsonify({"message": "Acesso negado."}), 403

    conn = get_db_connection()
    if not conn:
        return jsonify({"message": "Erro de conexão com o banco de dados."}), 500

    try:
        cur = conn.cursor()
        cur.execute("SELECT id, username, is_admin, created_at FROM users ORDER BY created_at DESC")
        users = cur.fetchall()

        users_list = [{
            "id": u[0],
            "username": u[1],
            "is_admin": u[2],
            "created_at": u[3].strftime("%Y-%m-%d %H:%M:%S")
        } for u in users]
        return jsonify(users_list), 200
    except psycopg2.Error as e:
        print(f"Erro ao listar usuários: {e}")
        return jsonify({"message": "Ocorreu um erro interno ao listar usuários."}), 500
    finally:
        if 'cur' in locals() and cur: cur.close()
        if conn: conn.close()

@app.route('/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    if not validate_admin_token():
        return jsonify({"message": "Acesso negado."}), 403

    conn = get_db_connection()
    if not conn:
        return jsonify({"message": "Erro de conexão com o banco de dados."}), 500

    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))

        if cur.rowcount == 0:
            return jsonify({"message": "Usuário com o ID especificado não encontrado."}), 404

        conn.commit()
        return jsonify({"message": f"Usuário com ID {user_id} deletado com sucesso."}), 200
    except psycopg2.Error as e:
        print(f"Erro ao deletar usuário (ID: {user_id}): {e}")
        return jsonify({"message": "Ocorreu um erro interno ao deletar o usuário."}), 500
    finally:
        if 'cur' in locals() and cur: cur.close()
        if conn: conn.close()

@app.route('/api/server-status', methods=['GET'])
def api_server_status():
    token = request.cookies.get('jwt_token')
    if not validate_token(token):
        return jsonify({"message": "Não autorizado"}), 401
    
    if os.getenv("RENDER"):
        return jsonify({"storage_status": "green"}), 200
    else:
        return jsonify({"storage_status": "red"}), 200

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)