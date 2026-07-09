/* 比赛详情页逻辑：信息展示、编辑、选手管理 */
const CID = qs('id');
let compCache = null;

if (requireLogin() && CID) {
  renderTopbar('home');
  renderSidebar('home');
  loadCompetition();
} else if (!CID) {
  location.href = '/index.html';
}

async function loadCompetition() {
  try {
    const res = await API.get('/api/competitions/' + CID);
    compCache = res.data;
    renderCompetition();
  } catch (err) {
    toast(err.message, 'error');
    document.querySelector('.main').innerHTML = `<div class="empty"><div class="ico">⚠️</div><div class="txt">${escapeHtml(err.message)}</div></div>`;
  }
}

function renderCompetition() {
  const c = compCache;
  document.getElementById('c-name').textContent = c.name;
  document.getElementById('c-sub').innerHTML = statusBadge(c.status) +
    (c.has_scores ? ' <span class="text-muted">· 已有计分记录</span>' : '');

  // 基础信息
  document.getElementById('c-info').innerHTML = `
    <tr><td style="width:140px;color:var(--muted)">比赛名称</td><td>${escapeHtml(c.name)}</td>
        <td style="width:140px;color:var(--muted)">比赛状态</td><td>${statusBadge(c.status)}</td></tr>
    <tr><td style="color:var(--muted)">评委个数</td><td>${c.judge_count || '<span class="text-muted">未设置</span>'}</td>
        <td style="color:var(--muted)">创建时间</td><td>${escapeHtml(c.created_at)}</td></tr>
    <tr><td style="color:var(--muted)">备注说明</td><td colspan="3">${escapeHtml(c.description) || '<span class="text-muted">无</span>'}</td></tr>`;

  // 科目
  const subs = c.subjects || [];
  document.getElementById('c-subjects').innerHTML = subs.length ? subs.map(s => `
    <tr><td class="num">${s.seq}</td><td>${escapeHtml(s.name)}</td><td class="num">${s.max_score}</td></tr>`).join('')
    : `<tr><td colspan="3" class="text-muted" style="text-align:center;padding:24px">暂无科目</td></tr>`;

  // 选手
  renderPlayers();

  // 操作按钮
  const actions = document.getElementById('c-actions');
  actions.innerHTML = '';
  if (c.status === 'draft') {
    actions.innerHTML += `<button class="btn" onclick="openEditModal()">编辑</button>`;
    actions.innerHTML += `<button class="btn btn-primary" onclick="location.href='/scoring.html?id=${c.id}'">开始比赛</button>`;
  } else if (c.status === 'ongoing') {
    actions.innerHTML += `<button class="btn btn-accent" onclick="location.href='/scoring.html?id=${c.id}'">进入计分</button>`;
    actions.innerHTML += `<button class="btn btn-ghost" disabled title="进行中不可编辑">编辑</button>`;
  } else {
    actions.innerHTML += `<button class="btn btn-primary" onclick="location.href='/result.html?id=${c.id}'">查看结果</button>`;
  }

  // 选手增删按钮（进行中禁用）
  const addWrap = document.getElementById('player-add-wrap');
  if (c.status === 'ongoing') {
    addWrap.innerHTML = `<span class="badge badge-ongoing">进行中·禁止修改选手</span>`;
  } else {
    addWrap.innerHTML = `<button class="btn btn-sm btn-primary" onclick="openPlayerModal()">+ 添加选手</button>`;
  }
}

function renderPlayers() {
  const c = compCache;
  const tbody = document.getElementById('c-players');
  const players = c.players || [];
  if (!players.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center;padding:24px">暂无选手，请先添加</td></tr>`;
    return;
  }
  const locked = c.status === 'ongoing';
  tbody.innerHTML = players.map(p => `
    <tr>
      <td class="num">${p.seq}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.remark) || '<span class="text-muted">-</span>'}</td>
      <td class="num">
        <div class="actions">
          <button class="btn-link" ${locked?'disabled':''} onclick="openPlayerModal(${p.id})">编辑</button>
          <button class="btn-link danger" ${locked?'disabled':''} onclick="deletePlayer(${p.id}, '${escapeHtml(p.name)}')">删除</button>
        </div>
      </td>
    </tr>`).join('');
}

/* ---------- 选手增改 ---------- */
function openPlayerModal(pid) {
  const p = pid ? (compCache.players || []).find(x => x.id === pid) : null;
  openModal(`
    <div class="modal-head"><h3>${p ? '编辑选手' : '添加选手'}</h3><button class="close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-group"><label>姓名 <span class="req">*</span></label><input id="p-name" value="${p ? escapeHtml(p.name) : ''}" placeholder="请输入选手姓名"></div>
      <div class="form-group"><label>备注</label><input id="p-remark" value="${p ? escapeHtml(p.remark) : ''}" placeholder="选填"></div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitPlayer(${pid || 0})">保存</button>
    </div>`);
}

async function submitPlayer(pid) {
  const name = document.getElementById('p-name').value.trim();
  if (!name) { toast('请输入选手姓名', 'error'); return; }
  const remark = document.getElementById('p-remark').value.trim();
  try {
    if (pid) await API.put('/api/players/' + pid, { name, remark });
    else await API.post('/api/competitions/' + CID + '/players', { name, remark });
    toast('已保存', 'success');
    closeModal();
    loadCompetition();
  } catch (err) { toast(err.message, 'error'); }
}

async function deletePlayer(pid, name) {
  const ok = await confirmDialog(`确定删除选手「${escapeHtml(name)}」吗？<br><span class="text-muted">删除后剩余选手编号将自动重排。</span>`,
    { danger: true, okText: '确认删除' });
  if (!ok) return;
  try {
    await API.del('/api/players/' + pid);
    toast('已删除', 'success');
    loadCompetition();
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- 比赛编辑（含二次确认：覆盖 / 另存为新比赛） ---------- */
function openEditModal() {
  const c = compCache;
  openModal(`
    <div class="modal-head"><h3>编辑比赛</h3><button class="close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label>比赛名称 <span class="req">*</span></label><input id="e-name" value="${escapeHtml(c.name)}"></div>
        <div class="form-group"><label>评委个数 <span class="req">*</span></label><input type="number" id="e-judge" min="1" value="${c.judge_count || 1}"></div>
      </div>
      <div class="form-group"><label>备注说明</label><input id="e-desc" value="${escapeHtml(c.description)}"></div>
      <div class="form-group">
        <label>评分科目 <span class="req">*</span></label>
        <div class="hint mb">至少配置一个科目；每项科目需设置满分，录入成绩时分数不得超过该满分。</div>
        <div id="edit-subject-list"></div>
        <button class="btn btn-sm mt" onclick="addEditSubjectRow()">+ 添加科目</button>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitEdit()">保存修改</button>
    </div>`, { size: 'lg' });
  (c.subjects || []).forEach(s => addEditSubjectRow(s.name, s.max_score));
  if (!(c.subjects || []).length) addEditSubjectRow();
}

function addEditSubjectRow(name = '', maxScore = 100) {
  const box = document.getElementById('edit-subject-list');
  const row = document.createElement('div');
  row.className = 'flex gap-sm mt';
  row.style.alignItems = 'center';
  row.innerHTML = `
    <input class="s-name" placeholder="科目名称" value="${escapeHtml(name)}" style="flex:1">
    <input class="s-max" type="number" min="0" step="0.1" value="${maxScore}" style="width:110px" placeholder="满分">
    <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">删除</button>`;
  box.appendChild(row);
}

function collectEditSubjects() {
  const rows = document.querySelectorAll('#edit-subject-list > div');
  const subjects = [];
  let valid = true;
  rows.forEach(r => {
    const n = r.querySelector('.s-name').value.trim();
    const m = parseFloat(r.querySelector('.s-max').value);
    if (!n) { toast('存在科目名称为空', 'error'); valid = false; return; }
    subjects.push({ name: n, max_score: isNaN(m) ? 100 : m });
  });
  if (!valid) return null;
  if (!subjects.length) { toast('至少配置一个评分科目', 'error'); return null; }
  return subjects;
}

async function submitEdit(action) {
  const name = document.getElementById('e-name').value.trim();
  if (!name) { toast('请输入比赛名称', 'error'); return; }
  const judge_count = parseInt(document.getElementById('e-judge').value, 10);
  if (!judge_count || judge_count < 1) { toast('请输入有效的评委个数', 'error'); return; }
  const subjects = collectEditSubjects();
  if (!subjects) return;
  const body = {
    name,
    judge_count,
    description: document.getElementById('e-desc').value.trim(),
    subjects,
  };
  if (action) body.action = action;
  try {
    const res = await API.put('/api/competitions/' + CID, body);
    toast(res.message, 'success');
    closeModal();
    if (action === 'save_as_new' && res.data) {
      // 另存为新比赛后跳转到新比赛详情
      setTimeout(() => location.href = '/competition.html?id=' + res.data.id, 400);
    } else {
      loadCompetition();
    }
  } catch (err) {
    // 409 表示已有计分记录，需二次确认
    if (err.message.includes('历史比赛记录将被清除')) {
      showOverwriteConfirm(body);
    } else {
      toast(err.message, 'error');
    }
  }
}

function showOverwriteConfirm(body) {
  openModal(`
    <div class="modal-head"><h3>⚠️ 修改确认</h3></div>
    <div class="modal-body">
      <p>该比赛已存在历史计分记录，<b>修改后历史比赛记录将被清除</b>。请选择处理方式：</p>
      <div class="flex gap mt" style="flex-direction:column">
        <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
          <div class="fw-700">① 覆盖原比赛</div>
          <div class="text-muted" style="font-size:12px;margin-top:4px">确认修改，清除该比赛下所有历史计分记录并保存新配置。</div>
        </div>
        <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
          <div class="fw-700">② 另存为新比赛</div>
          <div class="text-muted" style="font-size:12px;margin-top:4px">保留原比赛与全部历史记录，将修改后的配置保存为一场全新的比赛。</div>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="closeModal(); submitEdit('save_as_new')">另存为新比赛</button>
      <button class="btn btn-danger" onclick="closeModal(); submitEdit('overwrite')">覆盖</button>
    </div>`, { size: '' });
}
