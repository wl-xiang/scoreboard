"""计分流程路由：录入(双模式)、编辑、删除、实时排行榜。"""
from flask import Blueprint, request, jsonify
from ..auth import require_auth
from ..models import Competition, Player, Subject, Score
from .. import db
from ..services import compute_leaderboard

score_bp = Blueprint('score', __name__)


def score_to_dict(s):
    return {
        'id': s.id,
        'player_id': s.player_id,
        'judge_index': s.judge_index,
        'subject_id': s.subject_id,
        'score': s.score,
    }


@score_bp.route('/competitions/<int:cid>/scores', methods=['GET'])
@require_auth
def list_scores(cid):
    Competition.query.get_or_404(cid)
    scores = Score.query.filter_by(competition_id=cid).all()
    return jsonify({'code': 0, 'data': [score_to_dict(s) for s in scores]})


@score_bp.route('/competitions/<int:cid>/scores', methods=['POST'])
@require_auth
def upsert_scores(cid):
    """
    录入某选手某评委的各科目分数（手动 / 快速模式均由前端解析后传入）。
    已存在的记录会被覆盖更新，未提交的科目不处理。
    """
    c = Competition.query.get_or_404(cid)
    if c.status != 'ongoing':
        return jsonify({'code': 400, 'message': '比赛未在进行中，无法录入计分'}), 400
    data = request.get_json(silent=True) or {}
    player_id = data.get('player_id')
    try:
        judge_index = int(data.get('judge_index'))
    except (ValueError, TypeError):
        return jsonify({'code': 400, 'message': '评委序号无效'}), 400
    if judge_index < 1 or (c.judge_count and judge_index > c.judge_count):
        return jsonify({'code': 400, 'message': '评委序号超出范围'}), 400

    player = Player.query.get(player_id)
    if not player or player.competition_id != cid:
        return jsonify({'code': 400, 'message': '选手不存在'}), 400

    subject_ids = {s.id for s in Subject.query.filter_by(competition_id=cid).all()}
    items = data.get('scores') or []
    for item in items:
        sid = item.get('subject_id')
        if sid not in subject_ids:
            continue
        try:
            val = float(item.get('score'))
        except (ValueError, TypeError):
            return jsonify({'code': 400, 'message': '分数格式错误'}), 400
        existing = Score.query.filter_by(
            player_id=player_id, judge_index=judge_index, subject_id=sid).first()
        if existing:
            existing.score = val
        else:
            db.session.add(Score(competition_id=cid, player_id=player_id,
                                 judge_index=judge_index, subject_id=sid, score=val))
    db.session.commit()
    return jsonify({'code': 0, 'message': '计分已保存'})


@score_bp.route('/scores/<int:sid>', methods=['PUT'])
@require_auth
def edit_score(sid):
    s = Score.query.get_or_404(sid)
    if s.competition.status != 'ongoing':
        return jsonify({'code': 400, 'message': '比赛未在进行中，无法修改计分'}), 400
    data = request.get_json(silent=True) or {}
    try:
        val = float(data.get('score'))
    except (ValueError, TypeError):
        return jsonify({'code': 400, 'message': '分数格式错误'}), 400
    s.score = val
    db.session.commit()
    return jsonify({'code': 0, 'message': '计分已更新'})


@score_bp.route('/scores/<int:sid>', methods=['DELETE'])
@require_auth
def delete_score(sid):
    s = Score.query.get_or_404(sid)
    if s.competition.status != 'ongoing':
        return jsonify({'code': 400, 'message': '比赛未在进行中，无法删除计分'}), 400
    db.session.delete(s)
    db.session.commit()
    return jsonify({'code': 0, 'message': '计分已删除'})


@score_bp.route('/competitions/<int:cid>/scores', methods=['DELETE'])
@require_auth
def delete_scores_batch(cid):
    """按 player_id / judge_index 批量删除计分（删除某选手某评委的全部科目分数）。"""
    c = Competition.query.get_or_404(cid)
    if c.status != 'ongoing':
        return jsonify({'code': 400, 'message': '比赛未在进行中，无法删除计分'}), 400
    data = request.get_json(silent=True) or {}
    q = Score.query.filter_by(competition_id=cid)
    if data.get('player_id') is not None:
        q = q.filter_by(player_id=data.get('player_id'))
    if data.get('judge_index') is not None:
        q = q.filter_by(judge_index=data.get('judge_index'))
    q.delete(synchronize_session=False)
    db.session.commit()
    return jsonify({'code': 0, 'message': '计分已删除'})


@score_bp.route('/competitions/<int:cid>/leaderboard', methods=['GET'])
@require_auth
def leaderboard(cid):
    """实时排行榜：返回选手排名、各评委分、各科目分、最终分。"""
    c = Competition.query.get_or_404(cid)
    results, subjects, judge_range = compute_leaderboard(c)
    players = []
    for r in results:
        p = r['player']
        players.append({
            'rank': r['rank'],
            'seq': p.seq,
            'player_id': p.id,
            'name': p.name,
            'remark': p.remark,
            'judge_totals': {str(j): round(r['judge_totals'][i], 4)
                             for i, j in enumerate(judge_range)},
            'subject_totals': {str(sid): round(v, 4) for sid, v in r['subject_totals'].items()},
            'final_score': r['final_score'],
            'has_scores': r['has_scores'],
        })
    return jsonify({'code': 0, 'data': {
        'players': players,
        'subjects': [{'id': s.id, 'name': s.name, 'seq': s.seq} for s in subjects],
        'judges': judge_range,
        'judge_count': c.judge_count,
        'current_judge': c.current_judge,
        'remove_max': c.remove_max,
        'remove_min': c.remove_min,
        'remove_zero': c.remove_zero,
    }})
