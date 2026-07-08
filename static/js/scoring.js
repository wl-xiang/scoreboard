/* 计分页逻辑：前置设置、以选手为单位录入各评委评分、实时排行榜 */
const CID = qs('id');
let comp = null;

if (requireLogin() && CID) {
  renderTopbar('home');
  renderSidebar('home');
  init();
} else if (!CID) {
  location.href = '/index.html';
}

async function init() {
  try {
    const res = await API.get('/api/competitions/' + CID);
    comp = res.data;
    document.getElementById('s-title').textContent = comp.name;
    document.getElementById('s-sub').innerHTML = statusBadge(comp.status);

    if (comp.status === 'draft') {
      showSetup();
    } else if (comp.status === 'ongoing') {
      showScoringUI();
    } else {
      // 已结束 -> 结果页
      location.href = '/result.html?id=' + CID;
    }
  } catch (err) {
    toast(err.message, 'error');
    document.querySelector('.main').innerHTML = `<div class="empty"><div class="ico">⚠️</div><div class="txt">${escapeHtml(err.message)}</div></div>`;
  }
}

/* ---------- 计分前置设置（已不需要输入评委个数，仅确认开始） ---------- */
function showSetup() {
  document.getElementById('setup-card').classList.remove('hide');
  document.getElementById('scoring-ui').classList.add('hide');
  document.getElementById('player-count').value = (comp.players || []).length + ' 人';
  document.getElementById('judge-count-display').value = (comp.judge_count || 0) + ' 人';
}

async function startScoring() {
  if (!comp.judge_count || comp.judge_count < 1) {
    toast('请先在比赛信息中设置评委个数', 'error');
    return;
  }
  if (!(comp.players || []).length) {
    toast('请先在比赛详情页添加选手', 'error');
    return;
  }
  try {
    await API.post('/api/competitions/' + CID + '/start', {});
    toast('比赛已开始', 'success');
    setTimeout(() => location.reload(), 400);
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- 计分主界面 ---------- */
async function showScoringUI() {
  document.getElementById('setup-card').classList.add('hide');
  document.getElementById('scoring-ui').classList.remove('hide');
  // 操作按钮
  document.getElementById('s-actions').innerHTML =
    `<a class="btn" href="/competition.html?id=${CID}">比赛详情</a>` +
    `<a class="btn btn-primary" href="/result.html?id=${CID}">查看当前结果</a>`;
  await Promise.all([loadLeaderboard(), loadScores()]);
}

/* ---------- 计分规则 ---------- */
async function updateCalcOptions() {
  const remove_max = document.getElementById('opt-remove-max').checked;
  const remove_min = document.getElementById('opt-remove-min').checked;
  const remove_zero = document.getElementById('opt-remove-zero').checked;
  try {
    await API.put('/api/competitions/' + CID + '/calc-options', { remove_max, remove_min, remove_zero });
    await loadLeaderboard();
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- 实时排行榜 ---------- */
async function loadLeaderboard() {
  try {
    const res = await API.get('/api/competitions/' + CID + '/leaderboard');
    const d = res.data;
    comp.judge_count = d.judge_count;
    document.getElementById('opt-remove-max').checked = d.remove_max;
    document.getElementById('opt-remove-min').checked = d.remove_min;
    document.getElementById('opt-remove-zero').checked = d.remove_zero;
    renderLeaderboard(d);
  } catch (err) { toast(err.message, 'error'); }
}

function renderLeaderboard(d) {
  const judges = d.judges || [];
  const head = document.getElementById('lb-head');
  let h = '<tr><th class="num">名次</th><th>姓名</th>';
  judges.forEach(j => { h += `<th class="num">评委${j}</th>`; });
  h += '<th class="num">最终得分</th></tr>';
  head.innerHTML = h;

  const body = document.getElementById('lb-body');
  const players = d.players || [];
  if (!players.length) {
    body.innerHTML = `<tr><td colspan="${3 + judges.length}" class="text-muted" style="text-align:center;padding:20px">暂无选手</td></tr>`;
    return;
  }
  body.innerHTML = players.map(p => {
    let cells = '';
    judges.forEach(j => {
      const v = p.judge_totals[String(j)];
      cells += `<td class="score-cell">${v != null ? v : '-'}</td>`;
    });
    const cls = p.rank <= 3 ? 'top' + p.rank : '';
    return `<tr class="${cls}">
      <td class="num rank-cell">${rankCell(p.rank)}</td>
      <td>${escapeHtml(p.name)} ${p.has_scores ? '' : '<span class="text-muted" style="font-size:11px">(未参赛)</span>'}</td>
      ${cells}
      <td class="num final-score">${p.final_score}</td>
    </tr>`;
  }).join('');
  document.getElementById('lb-tip').textContent = '共 ' + players.length + ' 名选手';
}

/* ---------- 计分记录列表：按选手折叠展示 ---------- */
let scoresCache = [];
let expandedPlayers = new Set();   // 已展开的选手 id 集合，跨重渲染保留状态

async function loadScores() {
  try {
    const res = await API.get('/api/competitions/' + CID + '/scores');
    scoresCache = res.data || [];
    renderScoreRecords(scoresCache);
  } catch (err) { toast(err.message, 'error'); }
}

function renderScoreRecords(scores) {
  const thead = document.getElementById('score-head');
  const tbody = document.getElementById('score-records');
  const players = comp.players || [];
  const subjects = comp.subjects || [];

  // 表头：选手 | 评委 | 各科目 | 小计 | 操作
  let head = '<tr><th>选手</th><th class="num">评委</th>';
  subjects.forEach(s => { head += `<th class="num">${escapeHtml(s.name)}</th>`; });
  head += '<th class="num">小计</th><th class="num">操作</th></tr>';
  thead.innerHTML = head;

  // 按选手分组：player_id -> { judge_index -> { subject_id -> score } }
  const groups = {};
  scores.forEach(s => {
    if (!groups[s.player_id]) groups[s.player_id] = {};
    if (!groups[s.player_id][s.judge_index]) groups[s.player_id][s.judge_index] = {};
    groups[s.player_id][s.judge_index][s.subject_id] = s.score;
  });

  const playerIds = Object.keys(groups).map(Number);
  const colCount = subjects.length + 4;  // 选手 + 评委 + 科目们 + 小计 + 操作
  if (!playerIds.length) {
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-muted" style="text-align:center;padding:20px">暂无计分记录，点击「添加计分」开始录入</td></tr>`;
    return;
  }

  // 按选手编号排序
  playerIds.sort((a, b) => {
    const pa = players.find(p => p.id === a);
    const pb = players.find(p => p.id === b);
    return ((pa && pa.seq) || 0) - ((pb && pb.seq) || 0);
  });

  const totalJudges = comp.judge_count || 0;
  let html = '';
  playerIds.forEach(pid => {
    const p = players.find(x => x.id === pid) || { name: '(已删除)', seq: '?' };
    const judgeMap = groups[pid];
    const judgeIndexes = Object.keys(judgeMap).map(Number).sort((a, b) => a - b);
    const enteredCount = judgeIndexes.length;
    const expanded = expandedPlayers.has(pid);
    const judgeSpan = subjects.length + 1;  // 科目列 + 小计列合并展示

    // 选手首行：选手信息 + 录入进度 + 操作按钮
    html += `<tr class="record-group-row">
      <td class="fw-700">${escapeHtml(p.seq + '. ' + p.name)}</td>
      <td class="num">${enteredCount}/${totalJudges || enteredCount} 已录入</td>
      <td colspan="${judgeSpan}" class="text-muted record-hint">${expanded ? '' : '点击「查看」展开各评委评分'}</td>
      <td class="num"><div class="actions">
        <button class="btn-link" onclick="togglePlayerRecord(${pid})">${expanded ? '折叠' : '查看'}</button>
        <button class="btn-link" onclick="editRecord(${pid})">编辑</button>
        <button class="btn-link danger" onclick="deletePlayerRecord(${pid})">删除</button>
      </div></td>
    </tr>`;

    // 展开详情：一个评委一行，展示各科目分数与小计
    if (expanded) {
      judgeIndexes.forEach(j => {
        const subjScores = judgeMap[j];
        let cells = '';
        let subtotal = 0;
        subjects.forEach(s => {
          const v = subjScores[s.id];
          cells += `<td class="score-cell">${v != null ? v : 0}</td>`;
          subtotal += (v != null ? v : 0);
        });
        html += `<tr class="record-detail-row">
          <td></td>
          <td class="num">评委${j}</td>
          ${cells}
          <td class="num fw-700">${subtotal.toFixed(4).replace(/\.?0+$/, '')}</td>
          <td></td>
        </tr>`;
      });
    }
  });
  tbody.innerHTML = html;
}

function togglePlayerRecord(pid) {
  if (expandedPlayers.has(pid)) expandedPlayers.delete(pid);
  else expandedPlayers.add(pid);
  renderScoreRecords(scoresCache);
}

async function deletePlayerRecord(pid) {
  const p = (comp.players || []).find(x => x.id === pid);
  const ok = await confirmDialog(
    `确定删除「${escapeHtml(p ? p.name : '')}」的全部计分记录吗？<br><span class="text-muted">将清除该选手所有评委的评分，不可恢复。</span>`,
    { danger: true, okText: '确认删除' });
  // 确认弹窗会替换 modal 内容，无需重建
  if (!ok) return;
  try {
    await API.del('/api/competitions/' + CID + '/scores', { player_id: pid });
    toast('已删除', 'success');
    expandedPlayers.delete(pid);
    await Promise.all([loadLeaderboard(), loadScores()]);
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- 添加 / 编辑计分弹窗：以选手为单位逐个录入各评委评分 ---------- */
let scoreModalState = null;

/* 从缓存中提取某选手各评委的已有计分，结构：{ judge_index: { subject_id: score } } */
function buildExistingByJudge(playerId) {
  const map = {};
  scoresCache.filter(s => s.player_id === playerId).forEach(s => {
    (map[s.judge_index] = map[s.judge_index] || {})[s.subject_id] = s.score;
  });
  return map;
}

async function openScoreModal(playerId, judgeIndex) {
  const players = comp.players || [];
  if (!players.length) { toast('请先添加选手', 'error'); return; }
  const targetId = playerId || players[0].id;
  const existingByJudge = buildExistingByJudge(targetId);

  scoreModalState = {
    playerId: targetId,
    currentJudge: judgeIndex || 1,
    editing: !!playerId,
    existingByJudge,
    enteredJudges: new Set(Object.keys(existingByJudge).map(Number)),
    mode: 'fast',
  };
  renderScoreModal();
}

function renderScoreModal() {
  const state = scoreModalState;
  if (!state) return;
  const players = comp.players || [];
  const subjects = comp.subjects || [];
  const n = comp.judge_count || 0;
  const enteredCount = state.enteredJudges.size;

  const playerOpts = players.map(p =>
    `<option value="${p.id}" ${p.id === state.playerId ? 'selected' : ''}>${escapeHtml(p.seq + '. ' + p.name)}</option>`).join('');

  const judgePills = Array.from({ length: n }, (_, i) => {
    const j = i + 1;
    const entered = state.enteredJudges.has(j);
    const active = j === state.currentJudge;
    const cls = ['judge-pill'];
    if (active) cls.push('active');
    if (entered) cls.push('entered');
    return `<button type="button" class="${cls.join(' ')}" onclick="switchJudgeInModal(${j})">${j}${entered ? '✓' : ''}</button>`;
  }).join('');

  const existing = state.existingByJudge[state.currentJudge] || {};
  const isFast = (state.mode || 'fast') === 'fast';

  openModal(`
    <div class="modal-head"><h3>${state.editing ? '编辑计分' : '添加计分'}</h3><button class="close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group">
          <label>目标选手 <span class="req">*</span></label>
          <select id="m-player" ${state.editing ? 'disabled' : ''} onchange="onModalPlayerChange(this.value)">${playerOpts}</select>
        </div>
        <div class="form-group">
          <label>评委打分进度 <span class="text-muted" style="font-weight:400">（已录入 <b id="entered-count">${enteredCount}</b> / ${n}）</span></label>
          <div class="judge-pills">${judgePills}</div>
          <div class="hint">点击序号切换评委录入；允许某些评委不打分（未录入按 0 分计入）。</div>
        </div>
      </div>

      <div class="cur-judge-banner">当前录入：评委 <b>${state.currentJudge}</b> / ${n}</div>

      <div class="form-group">
        <label>录入方式</label>
        <div class="mode-switch">
          <label class="${isFast ? '' : 'checked'}" id="lbl-manual"><input type="radio" name="mode" value="manual" ${isFast ? '' : 'checked'} onchange="switchMode('manual')"> 手动模式</label>
          <label class="${isFast ? 'checked' : ''}" id="lbl-fast"><input type="radio" name="mode" value="fast" ${isFast ? 'checked' : ''} onchange="switchMode('fast')"> 快速模式</label>
        </div>
      </div>

      <div id="manual-area" class="${isFast ? 'hide' : ''}">
        <table class="data score-input-table">
          <thead><tr><th>序号</th><th>科目</th><th>满分</th><th>分数</th></tr></thead>
          <tbody id="subject-inputs"></tbody>
        </table>
      </div>

      <div id="fast-area" class="${isFast ? '' : 'hide'}">
        <div class="form-group">
          <label>分数字符串（以空格分隔）</label>
          <textarea id="fast-input" placeholder="例如：9.5 8.7 9.0 9.2"></textarea>
          <div class="hint">直接点「保存」也会自动提取；超出科目总数将截取前 N 个。</div>
        </div>
        <button class="btn btn-accent" onclick="autoExtract()">自动提取分数</button>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">完成</button>
      <button class="btn btn-danger" onclick="clearCurrentJudgeScores()">清除该评委</button>
      <button class="btn btn-primary" onclick="saveCurrentJudge(false)">保存</button>
      <button class="btn btn-accent" onclick="saveCurrentJudge(true)">保存并下一评委</button>
    </div>`, { size: 'lg' });

  renderSubjectInputs(subjects, existing);
}

function switchJudgeInModal(j) {
  if (!scoreModalState) return;
  scoreModalState.currentJudge = j;
  renderScoreModal();
}

function onModalPlayerChange(playerIdStr) {
  if (!scoreModalState) return;
  const playerId = parseInt(playerIdStr, 10);
  const existingByJudge = buildExistingByJudge(playerId);
  scoreModalState.playerId = playerId;
  scoreModalState.existingByJudge = existingByJudge;
  scoreModalState.enteredJudges = new Set(Object.keys(existingByJudge).map(Number));
  scoreModalState.currentJudge = 1;
  renderScoreModal();
}

function renderSubjectInputs(subjects, existing) {
  const tbody = document.getElementById('subject-inputs');
  tbody.innerHTML = subjects.map((s, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td>${escapeHtml(s.name)}</td>
      <td class="num">${s.max_score}</td>
      <td><input type="number" step="0.01" class="subj-score" data-sid="${s.id}" value="${existing[s.id] != null ? existing[s.id] : ''}" placeholder="0"></td>
    </tr>`).join('');
}

function switchMode(mode) {
  if (scoreModalState) scoreModalState.mode = mode;
  document.getElementById('manual-area').classList.toggle('hide', mode !== 'manual');
  document.getElementById('fast-area').classList.toggle('hide', mode !== 'fast');
  document.getElementById('lbl-manual').classList.toggle('checked', mode === 'manual');
  document.getElementById('lbl-fast').classList.toggle('checked', mode === 'fast');
}

/* 将快速模式输入框的分数字符串填入各科目输入框，返回是否成功填充 */
function applyFastExtract() {
  const el = document.getElementById('fast-input');
  if (!el) return false;
  const raw = el.value.trim();
  if (!raw) return false;
  const nums = raw.split(/\s+/).map(x => parseFloat(x)).filter(x => !isNaN(x));
  if (!nums.length) return false;
  const inputs = document.querySelectorAll('.subj-score');
  const n = inputs.length;
  inputs.forEach((inp, i) => { inp.value = i < nums.length ? nums[i] : ''; });
  return true;
}

function autoExtract() {
  const el = document.getElementById('fast-input');
  const raw = (el && el.value || '').trim();
  if (!raw) { toast('请输入分数字符串', 'error'); return; }
  const nums = raw.split(/\s+/).map(x => parseFloat(x)).filter(x => !isNaN(x));
  const inputs = document.querySelectorAll('.subj-score');
  const n = inputs.length;
  inputs.forEach((inp, i) => { inp.value = i < nums.length ? nums[i] : ''; });
  if (nums.length > n) {
    toast(`已提取前 ${n} 个数字（输入共 ${nums.length} 个）`, 'warning');
  } else {
    toast(`已填充 ${Math.min(nums.length, n)} 个科目`, 'success');
  }
}

async function saveCurrentJudge(goNext) {
  const state = scoreModalState;
  if (!state) return;
  const playerId = state.playerId;
  const judge = state.currentJudge;
  if (!playerId) { toast('请选择选手', 'error'); return; }

  // 快速模式下，若用户忘记点「自动提取」直接保存，则自动提取后再保存
  if ((state.mode || 'fast') === 'fast' && applyFastExtract()) {
    toast('已自动提取分数', 'info', 1500);
  }

  const inputs = document.querySelectorAll('.subj-score');
  const scores = [];
  for (const inp of inputs) {
    const sid = parseInt(inp.dataset.sid, 10);
    const raw = (inp.value || '').trim();
    const v = raw === '' ? 0 : parseFloat(raw);
    if (isNaN(v)) { toast('存在分数格式错误', 'error'); return; }
    scores.push({ subject_id: sid, score: v });
  }
  if (!scores.length) { toast('无科目可保存', 'error'); return; }

  try {
    await API.post('/api/competitions/' + CID + '/scores', { player_id: playerId, judge_index: judge, scores });
    toast(`评委 ${judge} 计分已保存`, 'success');
    // 更新录入状态
    state.enteredJudges.add(judge);
    const saved = {};
    scores.forEach(s => saved[s.subject_id] = s.score);
    state.existingByJudge[judge] = saved;
    // 刷新主页数据（同步更新 scoresCache）
    await Promise.all([loadLeaderboard(), loadScores()]);
    if (goNext) {
      if (state.currentJudge < comp.judge_count) {
        state.currentJudge++;
      } else {
        toast('已是最后一位评委', 'info');
      }
    }
    renderScoreModal();
  } catch (err) { toast(err.message, 'error'); }
}

async function clearCurrentJudgeScores() {
  const state = scoreModalState;
  if (!state) return;
  const ok = await confirmDialog(`确定清除「评委 ${state.currentJudge}」对该选手的全部科目分数吗？`, { danger: true, okText: '确认清除' });
  // 确认弹窗会替换 modal 内容，无论确认与否都需要重建计分弹窗
  if (!ok) { renderScoreModal(); return; }
  try {
    await API.del('/api/competitions/' + CID + '/scores', { player_id: state.playerId, judge_index: state.currentJudge });
    toast('已清除该评委评分', 'success');
    state.enteredJudges.delete(state.currentJudge);
    delete state.existingByJudge[state.currentJudge];
    await Promise.all([loadLeaderboard(), loadScores()]);
    renderScoreModal();
  } catch (err) {
    toast(err.message, 'error');
    renderScoreModal();
  }
}

function editRecord(playerId) {
  openScoreModal(playerId);
}

/* ---------- 结束比赛 ---------- */
async function finishScoring() {
  const ok = await confirmDialog(
    `确定要结束比赛「${escapeHtml(comp.name)}」吗？<br><span class="text-muted">结束后将关闭计分录入权限，比赛将归入历史记录。可在历史记录中查看与导出结果。</span>`,
    { danger: true, okText: '结束比赛' });
  if (!ok) return;
  try {
    await API.post('/api/competitions/' + CID + '/finish');
    toast('比赛已结束', 'success');
    setTimeout(() => location.href = '/result.html?id=' + CID, 500);
  } catch (err) { toast(err.message, 'error'); }
}
