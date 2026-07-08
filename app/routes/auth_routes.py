"""鉴权相关路由：登录、登出、当前用户。"""
from flask import Blueprint, request, jsonify, g
from ..auth import login_user, require_auth

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    if not username or not password:
        return jsonify({'code': 400, 'message': '请输入用户名和密码'}), 400
    token = login_user(username, password)
    if not token:
        return jsonify({'code': 401, 'message': '用户名或密码错误'}), 401
    return jsonify({'code': 0, 'message': '登录成功', 'data': {'token': token, 'username': username}})


@auth_bp.route('/logout', methods=['POST'])
@require_auth
def logout():
    # Token 永久有效，登出仅由前端清除本地存储
    return jsonify({'code': 0, 'message': '已退出登录'})


@auth_bp.route('/me', methods=['GET'])
@require_auth
def me():
    return jsonify({'code': 0, 'data': {'username': g.current_user.username}})
