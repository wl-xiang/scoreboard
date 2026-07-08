"""数据模型定义：用户、比赛、评分科目、选手、计分记录。"""
from datetime import datetime
from . import db


class User(db.Model):
    """系统用户，内置预设账号，Token 永久有效。"""
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    token = db.Column(db.String(64), unique=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Competition(db.Model):
    """比赛：status 取值 draft(未开始) / ongoing(进行中) / finished(已结束)。"""
    __tablename__ = 'competitions'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default='')
    location = db.Column(db.String(200), default='')
    date = db.Column(db.String(20), default='')
    status = db.Column(db.String(20), default='draft')
    judge_count = db.Column(db.Integer, default=0)      # 评委总个数
    current_judge = db.Column(db.Integer, default=1)    # 当前录入的评委序号
    remove_max = db.Column(db.Boolean, default=False)   # 计算时是否去掉一个最高分
    remove_min = db.Column(db.Boolean, default=False)   # 计算时是否去掉一个最低分
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    subjects = db.relationship(
        'Subject', backref='competition', cascade='all, delete-orphan',
        order_by='Subject.seq', lazy=True)
    players = db.relationship(
        'Player', backref='competition', cascade='all, delete-orphan',
        order_by='Player.seq', lazy=True)
    scores = db.relationship(
        'Score', backref='competition', cascade='all, delete-orphan', lazy=True)


class Subject(db.Model):
    """评分科目：隶属于某场比赛，按 seq 排序。"""
    __tablename__ = 'subjects'
    id = db.Column(db.Integer, primary_key=True)
    competition_id = db.Column(db.Integer, db.ForeignKey('competitions.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    max_score = db.Column(db.Float, default=100.0)
    seq = db.Column(db.Integer, default=1)


class Player(db.Model):
    """选手：姓名必填、备注选填，seq 从 1 连续编号。"""
    __tablename__ = 'players'
    id = db.Column(db.Integer, primary_key=True)
    competition_id = db.Column(db.Integer, db.ForeignKey('competitions.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    remark = db.Column(db.String(500), default='')
    seq = db.Column(db.Integer, default=1)


class Score(db.Model):
    """计分记录：某选手、某评委、某科目的分数，唯一约束防止重复。"""
    __tablename__ = 'scores'
    id = db.Column(db.Integer, primary_key=True)
    competition_id = db.Column(db.Integer, db.ForeignKey('competitions.id'), nullable=False)
    player_id = db.Column(db.Integer, db.ForeignKey('players.id'), nullable=False)
    judge_index = db.Column(db.Integer, nullable=False)  # 评委序号，从 1 开始
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=False)
    score = db.Column(db.Float, default=0.0)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('player_id', 'judge_index', 'subject_id', name='uq_player_judge_subject'),
    )
