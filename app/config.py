"""应用配置：数据库路径、预设账号、端口等均支持环境变量覆盖。"""
import os

# 项目根目录（/workspace），data 目录用于持久化 SQLite 文件
BASE_DIR = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
DATA_DIR = os.environ.get('DATA_DIR', os.path.join(BASE_DIR, 'data'))
os.makedirs(DATA_DIR, exist_ok=True)


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'qyjx-scoring-system-secret-2024')
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL',
        'sqlite:///' + os.path.join(DATA_DIR, 'scoring.db'),
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # SQLite 多线程/并发写入安全配置
    SQLALCHEMY_ENGINE_OPTIONS = {
        'connect_args': {'check_same_thread': False, 'timeout': 30},
        'pool_pre_ping': True,
    }
    # 预设账号（可通过环境变量覆盖）
    PRESET_USERNAME = os.environ.get('PRESET_USERNAME', 'qyjx')
    PRESET_PASSWORD = os.environ.get('PRESET_PASSWORD', 'qyjx')
    JSON_AS_ASCII = False
