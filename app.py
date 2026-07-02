# -*- coding: utf-8 -*-

from flask import Flask, jsonify, request, render_template, redirect, url_for, make_response
from werkzeug.exceptions import NotFound
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from flask_cors import CORS
import jwt
import os
import psycopg2
import bcrypt
import tempfile
import zipfile
from supabase import create_client, Client # Importa o conector do Supabase
from datetime import datetime, timedelta, UTC

load_dotenv()

app = Flask(__name__)
app.json.ensure_ascii = False
CORS(app)

# --- Configurações das Variáveis de Ambiente ---
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "educa_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD")
SECRET_KEY = os.getenv("SECRET_KEY")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "arquivos_educa")

if not SECRET_KEY:
    raise ValueError("Chave secreta (SECRET_KEY) não definida no arquivo .env.")
if not DB_PASSWORD:
    raise ValueError("Senha do banco de dados (DB_PASSWORD) não definida no arquivo .env.")

# Inicializa o cliente do Supabase se as chaves estiverem presentes
supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

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

# Higieniza caminhos para evitar travessia de diretório no Supabase
def get_safe_supabase_path(subpath, filename=""):
    safe_parts = [secure_filename(p) for p in subpath.split('/') if p.strip() and p.strip() != '..']
    if filename:
        safe_parts.append(secure_filename(filename))
    return "/".join(safe_parts)

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

# --- APIs de Gerenciamento de Arquivos e Pastas com SUPABASE STORAGE ---

# 1. LISTAR ARQUIVOS E PASTAS DO SUPABASE STORAGE
@app.route('/api/files', methods=['GET'])
def list_files():
    if not validate_token():
        return jsonify({"message": "Acesso negado."}), 403
    
    if not supabase:
        return jsonify({"message": "Armazenamento Supabase não configurado."}), 500
    
    subpath = request.args.get('path', '')
    safe_dir = get_safe_supabase_path(subpath)

    try:
        # Lista os itens da pasta no bucket do Supabase
        response = supabase.storage.from_(SUPABASE_BUCKET).list(safe_dir)
        item_list = []
        for item in response:
            name = item.get('name')
            if name == '.emptyFolderPlaceholder':
                continue # Ignora arquivos de marcação vazios do Supabase
            
            # No Supabase, itens sem ID interno de metadados são tratados como pastas
            if item.get('id') is None:
                item_list.append({"name": name, "size": "-", "type": "directory"})
            else:
                meta = item.get('metadata', {})
                size_bytes = meta.get('size', 0) if meta else 0
                size_kb = round(size_bytes / 1024, 2)
                item_list.append({"name": name, "size": f"{size_kb} KB", "type": "file"})
        return jsonify(item_list), 200
    except Exception as e:
        print(f"Erro ao listar arquivos: {e}")
        return jsonify({"message": "Erro ao acessar armazenamento na nuvem."}), 500

# 2. CRIAR NOVA PASTA NO SUPABASE STORAGE
@app.route('/api/create-folder', methods=['POST'])
def create_folder():
    if not validate_token():
        return jsonify({"message": "Acesso negado."}), 403
    
    if not supabase:
        return jsonify({"message": "Armazenamento Supabase não configurado."}), 500

    data = request.get_json()
    subpath = data.get('path', '')
    folder_name = data.get('name', '').strip()

    if not folder_name:
        return jsonify({"message": "Nome da pasta inválido."}), 400
    
    # Cria o caminho da pasta com um arquivo marcador vazio para o Supabase reconhecer o diretório
    safe_path = get_safe_supabase_path(subpath, folder_name)
    placeholder_path = f"{safe_path}/.emptyFolderPlaceholder"

    try:
        # Faz upload de um arquivo marcador vazio para forçar a criação da subpasta na nuvem
        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=placeholder_path,
            file=b"",
            file_options={"x-upsert": "true", "content-type": "text/plain"}
        )
        return jsonify({"message": "Pasta criada com sucesso!"}), 201
    except Exception as e:
        print(f"Erro ao criar pasta: {e}")
        return jsonify({"message": "Erro ao criar pasta na nuvem."}), 500

# 3. UPLOAD SEGURO COM RE-GRAVAÇÃO (UPSERT) DIRETAMENTE NO SUPABASE
@app.route('/api/upload', methods=['POST'])
def upload_file():
    if not validate_token():
        return jsonify({"message": "Acesso negado."}), 403
    
    if not supabase:
        return jsonify({"message": "Armazenamento Supabase não configurado."}), 500

    if 'file' not in request.files:
        return jsonify({"message": "Nenhum arquivo enviado."}), 400

    file = request.files['file']
    subpath = request.form.get('path', '')

    if file.filename == '':
        return jsonify({"message": "Nome de arquivo inválido."}), 400

    filename = secure_filename(file.filename)
    supabase_path = get_safe_supabase_path(subpath, filename)

    try:
        # Lê os bytes na memória para enviar diretamente (Stateless - Sem salvar no disco local)
        file_data = file.read()
        
        # Envia diretamente para o Supabase Storage usando upsert para substituir se já existir
        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=supabase_path,
            file=file_data,
            file_options={"x-upsert": "true", "content-type": file.content_type}
        )
        return jsonify({"message": "Upload concluído com sucesso!"}), 200
    except Exception as e:
        print(f"Erro no upload: {e}")
        return jsonify({"message": "Erro ao salvar arquivo na nuvem."}), 500

# 4. DOWNLOAD SEGURO DIRETAMENTE DA CDN DO SUPABASE
@app.route('/api/download', methods=['GET'])
def download_file():
    if not validate_token():
        return jsonify({"message": "Acesso negado."}), 403
    
    if not supabase:
        return jsonify({"message": "Armazenamento Supabase não configurado."}), 500

    name = request.args.get('name', '')
    subpath = request.args.get('path', '')
    
    safe_name = secure_filename(name)
    supabase_path = get_safe_supabase_path(subpath, safe_name)

    try:
        # Se for um arquivo normal, redirecionamos o navegador para baixar direto do link público CDN do Supabase
        # (Isso economiza banda e deixa o download incrivelmente rápido)
        # Se for uma pasta, nós baixamos os arquivos e geramos o ZIP em tempo real
        is_dir = False
        try:
            # Tenta listar para ver se é uma pasta
            res = supabase.storage.from_(SUPABASE_BUCKET).list(supabase_path)
            if len(res) > 0 or (len(res) == 1 and res[0]['name'] == '.emptyFolderPlaceholder'):
                is_dir = True
        except:
            pass

        if is_dir:
            # COMPACTA PASTA EM ZIP: Baixa todos os arquivos da pasta na nuvem e cria o ZIP na memória
            temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
            temp_zip.close()
            
            # Função recursiva interna para varrer arquivos no Supabase
            def zip_supabase_folder(zip_file, cloud_path, local_rel_path=""):
                items = supabase.storage.from_(SUPABASE_BUCKET).list(cloud_path)
                for item in items:
                    item_name = item['name']
                    if item_name == '.emptyFolderPlaceholder':
                        continue
                    
                    item_cloud_path = f"{cloud_path}/{item_name}" if cloud_path else item_name
                    item_local_path = os.path.join(local_rel_path, item_name) if local_rel_path else item_name
                    
                    if item.get('id') is None: # É pasta
                        zip_supabase_folder(zip_file, item_cloud_path, item_local_path)
                    else: # É arquivo
                        # Baixa o arquivo binário do Supabase
                        file_data = supabase.storage.from_(SUPABASE_BUCKET).download(item_cloud_path)
                        # Salva temporariamente para escrever no ZIP
                        temp_file_fd, temp_file_path = tempfile.mkstemp()
                        with os.fdopen(temp_file_fd, 'wb') as f:
                            f.write(file_data)
                        zip_file.write(temp_file_path, item_local_path)
                        os.remove(temp_file_path)

            with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                zip_supabase_folder(zip_file, supabase_path)

            return send_from_directory(
                os.path.dirname(temp_zip.name),
                os.path.basename(temp_zip.name),
                as_attachment=True,
                download_name=f"{safe_name}.zip"
            )
        else:
            # Baixa arquivo normal diretamente pelo link de download público do Supabase
            public_url_res = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(supabase_path)
            return redirect(public_url_res)
    except Exception as e:
        print(f"Erro no download: {e}")
        return jsonify({"message": "Erro ao processar download."}), 500

# 5. DELETAR ARQUIVOS OU PASTAS NO SUPABASE STORAGE
@app.route('/api/files', methods=['DELETE'])
def delete_item():
    if not validate_token():
        return jsonify({"message": "Acesso negado."}), 403
    
    if not supabase:
        return jsonify({"message": "Armazenamento Supabase não configurado."}), 500

    name = request.args.get('name', '')
    subpath = request.args.get('path', '')
    
    safe_name = secure_filename(name)
    supabase_path = get_safe_supabase_path(subpath, safe_name)

    try:
        # Função interna para deletar tudo dentro de uma pasta na nuvem de forma recursiva
        def delete_folder_recursive(cloud_path):
            items = supabase.storage.from_(SUPABASE_BUCKET).list(cloud_path)
            for item in items:
                item_name = item['name']
                item_cloud_path = f"{cloud_path}/{item_name}" if cloud_path else item_name
                if item.get('id') is None: # É pasta
                    delete_folder_recursive(item_cloud_path)
                else: # É arquivo
                    supabase.storage.from_(SUPABASE_BUCKET).remove([item_cloud_path])
            # Remove a própria pasta vazia deletando seu marcador
            supabase.storage.from_(SUPABASE_BUCKET).remove([f"{cloud_path}/.emptyFolderPlaceholder"])

        # Verifica se o item a ser deletado é pasta ou arquivo
        is_dir = False
        try:
            res = supabase.storage.from_(SUPABASE_BUCKET).list(supabase_path)
            if len(res) > 0 or (len(res) == 1 and res[0]['name'] == '.emptyFolderPlaceholder'):
                is_dir = True
        except:
            pass

        if is_dir:
            delete_folder_recursive(supabase_path)
        else:
            supabase.storage.from_(SUPABASE_BUCKET).remove([supabase_path])
            
        return jsonify({"message": "Item excluído da nuvem com sucesso!"}), 200
    except Exception as e:
        print(f"Erro ao deletar: {e}")
        return jsonify({"message": "Erro ao excluir item da nuvem."}), 500

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
        return jsonify({"message": "Banco de dados inicializado."}), 200
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