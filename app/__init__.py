"""Flask 应用工厂：初始化数据库、注册蓝图、提供静态页面路由。"""
import os
from flask import Flask, send_from_directory, abort
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash

db = SQLAlchemy()


def create_app():
    app = Flask(__name__, static_folder=None)
    from .config import Config
    app.config.from_object(Config)

    db.init_app(app)

    # 注册 API 蓝图
    from .routes.auth_routes import auth_bp
    from .routes.competition_routes import competition_bp
    from .routes.player_routes import player_bp
    from .routes.score_routes import score_bp
    from .routes.export_routes import export_bp
    app.register_blueprint(auth_bp, url_prefix='/api')
    app.register_blueprint(competition_bp, url_prefix='/api')
    app.register_blueprint(player_bp, url_prefix='/api')
    app.register_blueprint(score_bp, url_prefix='/api')
    app.register_blueprint(export_bp, url_prefix='/api')

    # 前端静态页面目录
    static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static')
    pages = {
        '/': 'login.html',
        '/index.html': 'index.html',
        '/competition.html': 'competition.html',
        '/scoring.html': 'scoring.html',
        '/history.html': 'history.html',
        '/result.html': 'result.html',
    }

    def serve_page(page):
        full = os.path.realpath(os.path.join(static_dir, page))
        root = os.path.realpath(static_dir)
        if full.startswith(root + os.sep) and os.path.isfile(full):
            return send_from_directory(static_dir, page)
        abort(404)

    for route, fname in pages.items():
        app.add_url_rule(route, 'page_' + fname,
                         (lambda f: (lambda: send_from_directory(static_dir, f)))(fname))

    # 静态资源（css/js）
    @app.route('/static/<path:filename>')
    def static_files(filename):
        return serve_page(filename)

    # 初始化数据库与预设账号
    with app.app_context():
        db.create_all()
        from .models import User
        if not User.query.filter_by(username=Config.PRESET_USERNAME).first():
            db.session.add(User(
                username=Config.PRESET_USERNAME,
                password_hash=generate_password_hash(Config.PRESET_PASSWORD),
            ))
            db.session.commit()

    return app
