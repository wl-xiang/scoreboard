"""比赛管理路由：增删改查、状态控制、计分参数。"""
from flask import Blueprint, request, jsonify
from ..auth import require_auth
from ..models import Competition, Subject, Player, Score
from .. import db

competition_bp = Blueprint('competition', __name__)


def comp_to_dict(c, include_children=False):
    """比赛对象序列化。"""
    d = {
        'id': c.id,
        'name': c.name,
        'description': c.description or '',
        'location': c.location or '',
        'date': c.date or '',
        'status': c.status,
        'judge_count': c.judge_count,
        'current_judge': c.current_judge,
        'remove_max': c.remove_max,
        'remove_min': c.remove_min,
        'created_at': c.created_at.strftime('%Y-%m-%d %H:%M') if c.created_at else '',
        'has_scores': bool(Score.query.filter_by(competition_id=c.id).first()),
        'player_count': Player.query.filter_by(competition_id=c.id).count(),
        'subject_count': Subject.query.filter_by(competition_id=c.id).count(),
    }
    if include_children:
        d['subjects'] = [{'id': s.id, 'name': s.name, 'max_score': s.max_score, 'seq': s.seq}
                         for s in c.subjects]
        d['players'] = [{'id': p.id, 'name': p.name, 'remark': p.remark, 'seq': p.seq}
                        for p in c.players]
    return d


def _parse_subjects(data):
    """从请求数据中提取并校验科目列表，返回 (subjects, error_message)。"""
    raw = data.get('subjects') or []
    valid = [s for s in raw if (s.get('name') or '').strip()]
    if not valid:
        return None, '至少配置一个评分科目'
    result = []
    for s in valid:
        try:
            ms = float(s.get('max_score') or 100)
        except (ValueError, TypeError):
            ms = 100.0
        result.append({'name': s['name'].strip(), 'max_score': ms})
    return result, None


def _add_subjects(competition_id, subjects):
    for i, s in enumerate(subjects, 1):
        db.session.add(Subject(competition_id=competition_id, name=s['name'],
                               max_score=s['max_score'], seq=i))


@competition_bp.route('/competitions', methods=['GET'])
@require_auth
def list_competitions():
    """获取比赛列表，status=finished 取历史比赛，status=active 取进行中/未开始。"""
    status = request.args.get('status')
    q = Competition.query
    if status == 'finished':
        q = q.filter_by(status='finished')
    elif status == 'active':
        q = q.filter(Competition.status != 'finished')
    items = q.order_by(Competition.created_at.desc()).all()
    return jsonify({'code': 0, 'data': [comp_to_dict(c) for c in items]})


@competition_bp.route('/competitions', methods=['POST'])
@require_auth
def create_competition():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'code': 400, 'message': '比赛名称不能为空'}), 400
    subjects, err = _parse_subjects(data)
    if err:
        return jsonify({'code': 400, 'message': err}), 400
    # 评委个数在创建时即设置
    try:
        judge_count = int(data.get('judge_count'))
    except (ValueError, TypeError):
        return jsonify({'code': 400, 'message': '请输入有效的评委个数'}), 400
    if judge_count < 1:
        return jsonify({'code': 400, 'message': '评委个数至少为 1'}), 400

    c = Competition(
        name=name,
        description=data.get('description') or '',
        judge_count=judge_count,
        status='draft',
    )
    db.session.add(c)
    db.session.flush()
    _add_subjects(c.id, subjects)
    db.session.commit()
    return jsonify({'code': 0, 'message': '创建成功', 'data': comp_to_dict(c, include_children=True)})


@competition_bp.route('/competitions/<int:cid>', methods=['GET'])
@require_auth
def get_competition(cid):
    c = Competition.query.get_or_404(cid)
    return jsonify({'code': 0, 'data': comp_to_dict(c, include_children=True)})


@competition_bp.route('/competitions/<int:cid>', methods=['PUT'])
@require_auth
def update_competition(cid):
    """
    编辑比赛。规则：
    - 进行中状态禁止编辑。
    - 已有计分记录时需二次确认：overwrite 覆盖(清空计分) / save_as_new 另存为新比赛。
    """
    c = Competition.query.get_or_404(cid)
    data = request.get_json(silent=True) or {}
    action = data.get('action')

    if c.status == 'ongoing' and action != 'save_as_new':
        return jsonify({'code': 400, 'message': '比赛进行中，禁止编辑'}), 400

    has_scores = bool(Score.query.filter_by(competition_id=c.id).first())
    if has_scores and action not in ('overwrite', 'save_as_new'):
        # 需要前端二次确认
        return jsonify({'code': 409, 'message': '修改后历史比赛记录将被清除',
                        'data': {'need_confirm': True}}), 409

    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'code': 400, 'message': '比赛名称不能为空'}), 400
    subjects, err = _parse_subjects(data)
    if err:
        return jsonify({'code': 400, 'message': err}), 400
    # 评委个数在编辑时也可调整
    try:
        judge_count = int(data.get('judge_count'))
    except (ValueError, TypeError):
        return jsonify({'code': 400, 'message': '请输入有效的评委个数'}), 400
    if judge_count < 1:
        return jsonify({'code': 400, 'message': '评委个数至少为 1'}), 400

    fields = dict(
        name=name,
        description=data.get('description') or '',
        judge_count=judge_count,
    )

    if action == 'save_as_new':
        new_c = Competition(status='draft', **fields)
        db.session.add(new_c)
        db.session.flush()
        _add_subjects(new_c.id, subjects)
        db.session.commit()
        return jsonify({'code': 0, 'message': '已另存为新比赛，原比赛记录已保留',
                        'data': comp_to_dict(new_c, include_children=True)})

    # overwrite：清除该比赛所有历史计分记录并保存新配置
    Score.query.filter_by(competition_id=c.id).delete()
    Subject.query.filter_by(competition_id=c.id).delete()
    for k, v in fields.items():
        setattr(c, k, v)
    db.session.flush()
    _add_subjects(c.id, subjects)
    db.session.commit()
    return jsonify({'code': 0, 'message': '修改成功，历史计分记录已清除',
                    'data': comp_to_dict(c, include_children=True)})


@competition_bp.route('/competitions/<int:cid>', methods=['DELETE'])
@require_auth
def delete_competition(cid):
    c = Competition.query.get_or_404(cid)
    db.session.delete(c)
    db.session.commit()
    return jsonify({'code': 0, 'message': '已删除'})


@competition_bp.route('/competitions/<int:cid>/start', methods=['POST'])
@require_auth
def start_competition(cid):
    """开始比赛：状态转为进行中。评委个数在创建时已设置，这里仅做校验。"""
    c = Competition.query.get_or_404(cid)
    if c.judge_count < 1:
        return jsonify({'code': 400, 'message': '请先在比赛信息中设置评委个数'}), 400
    if not Player.query.filter_by(competition_id=c.id).first():
        return jsonify({'code': 400, 'message': '请先添加至少一名选手'}), 400
    c.status = 'ongoing'
    c.current_judge = 1
    db.session.commit()
    return jsonify({'code': 0, 'message': '比赛已开始', 'data': comp_to_dict(c)})


@competition_bp.route('/competitions/<int:cid>/finish', methods=['POST'])
@require_auth
def finish_competition(cid):
    """结束比赛：状态转为已结束，关闭计分录入权限。"""
    c = Competition.query.get_or_404(cid)
    if c.status != 'ongoing':
        return jsonify({'code': 400, 'message': '比赛当前不在进行中'}), 400
    c.status = 'finished'
    db.session.commit()
    return jsonify({'code': 0, 'message': '比赛已结束', 'data': comp_to_dict(c)})


@competition_bp.route('/competitions/<int:cid>/calc-options', methods=['PUT'])
@require_auth
def update_calc_options(cid):
    """更新去最高/最低分选项，触发排行榜重新计算。"""
    c = Competition.query.get_or_404(cid)
    data = request.get_json(silent=True) or {}
    c.remove_max = bool(data.get('remove_max', False))
    c.remove_min = bool(data.get('remove_min', False))
    db.session.commit()
    return jsonify({'code': 0, 'message': '已更新计分规则', 'data': comp_to_dict(c)})


@competition_bp.route('/competitions/<int:cid>/next-judge', methods=['POST'])
@require_auth
def next_judge(cid):
    """切换至下一位评委录入状态。"""
    c = Competition.query.get_or_404(cid)
    if c.current_judge < c.judge_count:
        c.current_judge += 1
        db.session.commit()
    return jsonify({'code': 0, 'data': comp_to_dict(c)})


@competition_bp.route('/competitions/<int:cid>/current-judge', methods=['PUT'])
@require_auth
def set_current_judge(cid):
    c = Competition.query.get_or_404(cid)
    data = request.get_json(silent=True) or {}
    try:
        j = int(data.get('judge_index'))
    except (ValueError, TypeError):
        return jsonify({'code': 400, 'message': '评委序号无效'}), 400
    if j < 1 or (c.judge_count and j > c.judge_count):
        return jsonify({'code': 400, 'message': '评委序号超出范围'}), 400
    c.current_judge = j
    db.session.commit()
    return jsonify({'code': 0, 'data': comp_to_dict(c)})
