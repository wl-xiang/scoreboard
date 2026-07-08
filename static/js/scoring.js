/* 计分页逻辑：前置设置、双模式录入、实时排行榜、评委轮次 */
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
  // 评委选择下拉
  const sel = document.getElementById('judge-select');
  sel.innerHTML = '';
  for (let i = 1; i <= comp.judge_count; i++) {
    const o = document.createElement('option');
    o.value = i; o.textContent = '评委 ' + i;
    sel.appendChild(o);
  }
  // 操作按钮
  document.getElementById('s-actions').innerHTML =
    `<a class="btn" href="/competition.html?id=${CID}">比赛详情</a>` +
    `<a class="btn btn-primary" href="/result.html?id=${CID}">查看当前结果</a>`;
  await Promise.all([loadLeaderboard(), loadScores()]);
}

async function changeJudge(val) {
  try {
    await API.put('/api/competitions/' + CID + '/current-judge', { judge_index: parseInt(val, 10) });
    comp.current_judge = parseInt(val, 10);
    renderProgress();
  } catch (err) { toast(err.message, 'error'); }
}

async function nextJudge() {
  if (comp.current_judge >= comp.judge_count) {
    toast('已是最后一位评委', 'info');
    return;
  }
  try {
    const res = await API.post('/api/competitions/' + CID + '/next-judge');
    comp.current_judge = res.data.current_judge;
    document.getElementById('judge-select').value = comp.current_judge;
    renderProgress();
    toast('已切换至评委 ' + comp.current_judge, 'info');
  } catch (err) { toast(err.message, 'error'); }
}

function renderProgress() {
  const cur = comp.current_judge;
  const n = comp.judge_count;
  document.getElementById('progress-text').textContent = cur + ' / ' + n;
  document.getElementById('progress-fill').style.width = (n ? (cur / n * 100) : 0) + '%';
  document.getElementById('cur-judge').textContent = cur;
  document.getElementById('judge-select').value = cur;
}

/* ---------- 计分规则 ---------- */
async function updateCalcOptions() {
  const remove_max = document.getElementById('opt-remove-max').checked;
  const remove_min = document.getElementById('opt-remove-min').checked;
  try {
    await API.put('/api/competitions/' + CID + '/calc-options', { remove_max, remove_min });
    await loadLeaderboard();
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- 实时排行榜 ---------- */
async function loadLeaderboard() {
  try {
    const res = await API.get('/api/competitions/' + CID + '/leaderboard');
    const d = res.data;
    comp.current_judge = d.current_judge;
    comp.judge_count = d.judge_count;
    document.getElementById('opt-remove-max').checked = d.remove_max;
    document.getElementById('opt-remove-min').checked = d.remove_min;
    renderProgress();
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

/* ---------- 计分记录列表 ---------- */
async function loadScores() {
  try {
    const res = await API.get('/api/competitions/' + CID + '/scores');
    renderScoreRecords(res.data || []);
  } catch (err) { toast(err.message, 'error'); }
}

function renderScoreRecords(scores) {
  const tbody = document.getElementById('score-records');
  const players = comp.players || [];
  const subjects = comp.subjects || [];
  // 按 (player, judge) 分组
  const groups = {};
  scores.forEach(s => {
    const key = s.player_id + '_' + s.judge_index;
    (groups[key] = groups[key] || { player_id: s.player_id, judge_index: s.judge_index, map: {} }).map[s.subject_id] = s.score;
  });
  const keys = Object.keys(groups);
  if (!keys.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center;padding:20px">暂无计分记录，点击「添加计分」开始录入</td></tr>`;
    return;
  }
  // 排序：选手编号、评委序号
  keys.sort((a, b) => {
    const ga = groups[a], gb = groups[b];
    const pa = players.find(p => p.id === ga.player_id);
    const pb = players.find(p => p.id === gb.player_id);
    return ((pa && pa.seq) || 0) - ((pb && pb.seq) || 0) || ga.judge_index - gb.judge_index;
  });
  tbody.innerHTML = keys.map(k => {
    const g = groups[k];
    const p = players.find(x => x.id === g.player_id) || { name: '(已删除)' };
    const detail = subjects.map(s => {
      const v = g.map[s.id];
      return `<span class="tag">${escapeHtml(s.name)}: ${v != null ? v : 0}</span>`;
    }).join(' ');
    const subtotal = subjects.reduce((sum, s) => sum + (g.map[s.id] || 0), 0);
    return `<tr>
      <td>${escapeHtml(p.name)}</td>
      <td class="num">评委${g.judge_index}</td>
      <td>${detail}</td>
      <td class="num fw-700">${subtotal.toFixed(4).replace(/\.?0+$/, '')}</td>
      <td class="num"><div class="actions">
        <button class="btn-link" onclick="editRecord(${g.player_id}, ${g.judge_index})">编辑</button>
        <button class="btn-link danger" onclick="deleteRecord(${g.player_id}, ${g.judge_index})">删除</button>
      </div></td>
    </tr>`;
  }).join('');
}

/* ---------- 添加 / 编辑计分弹窗（双模式） ---------- */
function openScoreModal(playerId, judgeIndex) {
  const players = comp.players || [];
  const subjects = comp.subjects || [];
  const editing = !!playerId;
  const judge = judgeIndex || comp.current_judge;
  const existing = getExisting(playerId, judge);

  const playerOpts = players.map(p =>
    `<option value="${p.id}" ${p.id === playerId ? 'selected' : ''}>${escapeHtml(p.seq + '. ' + p.name)}</option>`).join('');

  openModal(`
    <div class="modal-head"><h3>${editing ? '编辑计分' : '添加计分'}</h3><button class="close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group">
          <label>目标选手 <span class="req">*</span></label>
          <select id="m-player" ${editing ? 'disabled' : ''}>${playerOpts}</select>
        </div>
        <div class="form-group">
          <label>评委</label>
          <select id="m-judge" ${editing ? 'disabled' : ''}>
            ${Array.from({ length: comp.judge_count }, (_, i) =>
              `<option value="${i + 1}" ${i + 1 === judge ? 'selected' : ''}>评委 ${i + 1}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-group">
        <label>录入方式</label>
        <div class="mode-switch">
          <label class="checked" id="lbl-manual"><input type="radio" name="mode" value="manual" checked onchange="switchMode('manual')"> 手动模式</label>
          <label id="lbl-fast"><input type="radio" name="mode" value="fast" onchange="switchMode('fast')"> 快速模式</label>
        </div>
      </div>

      <div id="manual-area">
        <table class="data score-input-table">
          <thead><tr><th>序号</th><th>科目</th><th>满分</th><th>分数</th></tr></thead>
          <tbody id="subject-inputs"></tbody>
        </table>
      </div>

      <div id="fast-area" class="hide">
        <div class="form-group">
          <label>分数字符串（以空格分隔）</label>
          <textarea id="fast-input" placeholder="例如：9.5 8.7 9.0 9.2"></textarea>
          <div class="hint">点击下方按钮按科目顺序自动提取；超出科目总数将截取前 N 个。</div>
        </div>
        <button class="btn btn-accent" onclick="autoExtract()">自动提取分数</button>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">取消</button>
      ${editing ? '' : `<button class="btn btn-primary" onclick="saveScore(true)">保存并录入下一评委</button>`}
      <button class="btn btn-primary" onclick="saveScore(false)">${editing ? '保存修改' : '保存'}</button>
    </div>`, { size: 'lg' });

  renderSubjectInputs(subjects, existing);
}

function getExisting(playerId, judge) {
  // 从当前 DOM 已渲染数据中无法获取，需先读取缓存。这里在打开编辑时异步预填。
  return scoreExistingCache[playerId + '_' + judge] || {};
}
let scoreExistingCache = {};

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
  document.getElementById('manual-area').classList.toggle('hide', mode !== 'manual');
  document.getElementById('fast-area').classList.toggle('hide', mode !== 'fast');
  document.getElementById('lbl-manual').classList.toggle('checked', mode === 'manual');
  document.getElementById('lbl-fast').classList.toggle('checked', mode === 'fast');
}

function autoExtract() {
  const raw = document.getElementById('fast-input').value.trim();
  if (!raw) { toast('请输入分数字符串', 'error'); return; }
  const nums = raw.split(/\s+/).map(x => parseFloat(x)).filter(x => !isNaN(x));
  const inputs = document.querySelectorAll('.subj-score');
  const n = inputs.length;
  inputs.forEach((inp, i) => {
    inp.value = i < nums.length ? nums[i] : '';
  });
  if (nums.length > n) {
    toast(`已提取前 ${n} 个数字（输入共 ${nums.length} 个）`, 'warning');
  } else {
    toast(`已填充 ${Math.min(nums.length, n)} 个科目`, 'success');
  }
}

async function saveScore(goNext) {
  const playerId = parseInt(document.getElementById('m-player').value, 10);
  const judge = parseInt(document.getElementById('m-judge').value, 10);
  const inputs = document.querySelectorAll('.subj-score');
  const scores = [];
  inputs.forEach(inp => {
    const sid = parseInt(inp.dataset.sid, 10);
    const v = inp.value === '' ? 0 : parseFloat(inp.value);
    if (isNaN(v)) { toast('存在分数格式错误', 'error'); return; }
    scores.push({ subject_id: sid, score: v });
  });
  if (!scores.length) { toast('无科目可保存', 'error'); return; }
  try {
    await API.post('/api/competitions/' + CID + '/scores', { player_id: playerId, judge_index: judge, scores });
    toast('计分已保存', 'success');
    // 刷新数据
    await Promise.all([loadLeaderboard(), loadScores()]);
    if (goNext) {
      // 切换至下一位评委，保留当前选手，清空输入
      if (comp.current_judge < comp.judge_count) {
        await nextJudge();
      } else {
        toast('已是最后一位评委，无法继续切换', 'info');
      }
      // 重置输入框
      document.querySelectorAll('.subj-score').forEach(inp => inp.value = '');
      document.getElementById('fast-input').value = '';
    } else {
      closeModal();
    }
  } catch (err) { toast(err.message, 'error'); }
}

async function editRecord(playerId, judge) {
  // 预填已有分数：从服务端拉取（这里直接用已加载的 scores 渲染数据缓存）
  try {
    const res = await API.get('/api/competitions/' + CID + '/scores');
    const map = {};
    res.data.filter(s => s.player_id === playerId && s.judge_index === judge).forEach(s => map[s.subject_id] = s.score);
    scoreExistingCache = {};
    scoreExistingCache[playerId + '_' + judge] = map;
    openScoreModal(playerId, judge);
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteRecord(playerId, judge) {
  const p = (comp.players || []).find(x => x.id === playerId);
  const ok = await confirmDialog(`确定删除「${escapeHtml(p ? p.name : '')}」评委 ${judge} 的全部计分吗？`, { danger: true, okText: '确认删除' });
  if (!ok) return;
  try {
    await API.del('/api/competitions/' + CID + '/scores', { player_id: playerId, judge_index: judge });
    toast('已删除', 'success');
    await Promise.all([loadLeaderboard(), loadScores()]);
  } catch (err) { toast(err.message, 'error'); }
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
