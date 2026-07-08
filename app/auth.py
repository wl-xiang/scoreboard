"""鉴权逻辑：登录签发永久 Token、请求级鉴权装饰器。"""
import secrets
from functools import wraps
from flask import request, jsonify, g
from werkzeug.security import generate_password_hash, check_password_hash
from .models import User
from . import db


def login_user(username, password):
    """校验账号密码，返回永久 Token；Token 不存在则生成并持久化。"""
    user = User.query.filter_by(username=username).first()
    if not user or not check_password_hash(user.password_hash, password):
        return None
    if not user.token:
        user.token = secrets.token_hex(32)
        db.session.commit()
    return user.token


def get_user_by_token(token):
    if not token:
        return None
    return User.query.filter_by(token=token).first()


def extract_token():
    """从 Authorization: Bearer <token> 或 X-Auth-Token 头中提取 Token。"""
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        return auth[7:].strip()
    return request.headers.get('X-Auth-Token')


def require_auth(f):
    """鉴权装饰器：未登录返回 401，已登录将 user 挂载到 g.current_user。"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = get_user_by_token(extract_token())
        if not user:
            return jsonify({'code': 401, 'message': '未登录或登录已失效'}), 401
        g.current_user = user
        return f(*args, **kwargs)
    return wrapper
