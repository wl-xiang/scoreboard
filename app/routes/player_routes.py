"""选手管理路由：增删改，删除后编号自动重排。"""
from flask import Blueprint, request, jsonify
from ..auth import require_auth
from ..models import Competition, Player
from .. import db

player_bp = Blueprint('player', __name__)


def renumber(competition_id):
    """删除选手后重排剩余选手编号，保持从 1 连续。"""
    players = Player.query.filter_by(competition_id=competition_id)\
        .order_by(Player.seq, Player.id).all()
    for i, p in enumerate(players, 1):
        p.seq = i
    db.session.commit()


def player_to_dict(p):
    return {'id': p.id, 'name': p.name, 'remark': p.remark, 'seq': p.seq}


@player_bp.route('/competitions/<int:cid>/players', methods=['POST'])
@require_auth
def add_player(cid):
    c = Competition.query.get_or_404(cid)
    if c.status == 'ongoing':
        return jsonify({'code': 400, 'message': '比赛进行中，禁止修改选手信息'}), 400
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'code': 400, 'message': '选手姓名不能为空'}), 400
    remark = (data.get('remark') or '').strip()
    seq = Player.query.filter_by(competition_id=cid).count() + 1
    p = Player(competition_id=cid, name=name, remark=remark, seq=seq)
    db.session.add(p)
    db.session.commit()
    return jsonify({'code': 0, 'message': '已添加选手', 'data': player_to_dict(p)})


@player_bp.route('/players/<int:pid>', methods=['PUT'])
@require_auth
def update_player(pid):
    p = Player.query.get_or_404(pid)
    if p.competition.status == 'ongoing':
        return jsonify({'code': 400, 'message': '比赛进行中，禁止修改选手信息'}), 400
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'code': 400, 'message': '选手姓名不能为空'}), 400
    p.name = name
    p.remark = (data.get('remark') or '').strip()
    db.session.commit()
    return jsonify({'code': 0, 'message': '已更新选手', 'data': player_to_dict(p)})


@player_bp.route('/players/<int:pid>', methods=['DELETE'])
@require_auth
def delete_player(pid):
    p = Player.query.get_or_404(pid)
    if p.competition.status == 'ongoing':
        return jsonify({'code': 400, 'message': '比赛进行中，禁止修改选手信息'}), 400
    cid = p.competition_id
    db.session.delete(p)
    db.session.commit()
    renumber(cid)
    return jsonify({'code': 0, 'message': '已删除选手'})
