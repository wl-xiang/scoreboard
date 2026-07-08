"""业务计算逻辑：选手最终分、排行榜、去高去低规则。"""
from .models import Player, Subject, Score


def compute_leaderboard(competition):
    """
    计算某场比赛所有选手的最终得分与排名。

    规则：
    - 每位评委对每位选手的打分 = 该评委各科目分数之和。
    - 未打分的评委按 0 分计入；未参赛选手最终分按 0。
    - 依据 remove_max / remove_min 决定是否去掉一个最高 / 最低评委分后再取平均。
    - 返回 (results, subjects, judge_range)，results 已按最终分降序排名。
    """
    players = Player.query.filter_by(competition_id=competition.id).order_by(Player.seq).all()
    subjects = Subject.query.filter_by(competition_id=competition.id).order_by(Subject.seq).all()
    scores = Score.query.filter_by(competition_id=competition.id).all()

    # 构建分数索引：(player_id, judge_index, subject_id) -> score
    score_map = {}
    scored_judges = set()
    for s in scores:
        score_map[(s.player_id, s.judge_index, s.subject_id)] = s.score
        scored_judges.add(s.judge_index)

    n_judges = competition.judge_count or 0
    if n_judges > 0:
        judge_range = list(range(1, n_judges + 1))
    else:
        judge_range = sorted(scored_judges)

    results = []
    for player in players:
        judge_totals = []                 # 每位评委对该选手的总分
        judge_subject_scores = {}          # judge_index -> {subject_id: score}
        subject_totals = {s.id: 0.0 for s in subjects}

        for j in judge_range:
            subj_scores = {}
            total = 0.0
            for subj in subjects:
                val = score_map.get((player.id, j, subj.id), 0.0)
                subj_scores[subj.id] = val
                total += val
                subject_totals[subj.id] += val
            judge_subject_scores[j] = subj_scores
            judge_totals.append(total)    # 未打分评委自动为 0

        has_scores = any(v != 0 for v in judge_totals)

        # 去除无效评委评分（全 0 评分）：将该选手所有科目均为 0 的评委剔除后再计算
        if competition.remove_zero:
            valid_totals = [t for t in judge_totals if t != 0]
        else:
            valid_totals = list(judge_totals)

        # 去掉最高 / 最低分：
        # - 同时去最高/最低：评委数需 ≥3 才生效，否则不处理（兜底保留全部）
        # - 仅去最高或仅去最低：评委数需 ≥2 才生效
        # - 任一规则下都保证至少保留 1 位评委
        totals = list(valid_totals)
        n = len(totals)
        both = competition.remove_max and competition.remove_min
        if both and n >= 3:
            # 去掉一个最高、一个最低（值相同时各删一个即可）
            sorted_t = sorted(totals)
            kept = sorted_t[1:-1]  # 去掉最小和最大各一个
            totals = kept
        elif competition.remove_max and not both and n >= 2:
            sorted_t = sorted(totals)
            kept = sorted_t[:-1]  # 去掉最大一个
            totals = kept
        elif competition.remove_min and not both and n >= 2:
            sorted_t = sorted(totals)
            kept = sorted_t[1:]  # 去掉最小一个
            totals = kept

        final = round(sum(totals) / len(totals), 4) if totals else 0.0

        results.append({
            'player': player,
            'judge_totals': judge_totals,
            'judge_subject_scores': judge_subject_scores,
            'subject_totals': subject_totals,
            'final_score': final,
            'has_scores': has_scores,
        })

    # 按最终分降序，分数相同按选手编号升序，保证排名稳定
    results.sort(key=lambda r: (-r['final_score'], r['player'].seq))
    for i, r in enumerate(results):
        r['rank'] = i + 1

    return results, subjects, judge_range
