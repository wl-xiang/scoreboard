/* 主页逻辑：比赛列表、新建比赛 */
if (requireLogin()) {
  renderTopbar('home');
  renderSidebar('home');
  loadCompetitions();
}

let competitionsCache = [];

async function loadCompetitions() {
  const list = document.getElementById('comp-list');
  list.innerHTML = '<div class="empty"><div class="ico">⏳</div><div class="txt">加载中...</div></div>';
  try {
    const res = await API.get('/api/competitions?status=active');
    competitionsCache = res.data || [];
    renderStats();
    renderList();
  } catch (err) {
    list.innerHTML = `<div class="empty"><div class="ico">⚠️</div><div class="txt">${escapeHtml(err.message)}</div></div>`;
  }
}

function renderStats() {
  const all = competitionsCache;
  const draft = all.filter(c => c.status === 'draft').length;
  const ongoing = all.filter(c => c.status === 'ongoing').length;
  const totalPlayers = all.reduce((s, c) => s + (c.player_count || 0), 0);
  document.getElementById('stat-row').innerHTML = `
    <div class="stat"><div class="label">比赛总数</div><div class="value">${all.length}</div></div>
    <div class="stat"><div class="label">进行中</div><div class="value accent">${ongoing}</div></div>
    <div class="stat"><div class="label">未开始</div><div class="value">${draft}</div></div>
    <div class="stat"><div class="label">选手总数</div><div class="value">${totalPlayers}</div></div>`;
}

function renderList() {
  const list = document.getElementById('comp-list');
  if (!competitionsCache.length) {
    list.innerHTML = `<div class="empty"><div class="ico">📋</div><div class="txt">暂无比赛，点击右上角「新建比赛」开始创建</div></div>`;
    return;
  }
  const html = '<div class="comp-grid">' + competitionsCache.map(c => `
    <div class="comp-card">
      <div class="flex between center">
        <div class="name">${escapeHtml(c.name)}</div>
        ${statusBadge(c.status)}
      </div>
      <div class="meta">
        <span>👥 ${c.player_count} 选手</span>
        <span>📝 ${c.subject_count} 科目</span>
        <span>⚖ ${c.judge_count || 0} 评委</span>
      </div>
      <div class="desc">${c.description ? escapeHtml(c.description) : '<span class="text-muted">暂无描述</span>'}</div>
      <div class="footer">
        <button class="btn btn-sm" onclick="location.href='/competition.html?id=${c.id}'">详情</button>
        ${c.status === 'draft' ? `<button class="btn btn-sm btn-primary" onclick="location.href='/scoring.html?id=${c.id}'">开始比赛</button>` : ''}
        ${c.status === 'ongoing' ? `<button class="btn btn-sm btn-accent" onclick="location.href='/scoring.html?id=${c.id}'">进入计分</button>` : ''}
        <button class="btn btn-sm btn-danger" onclick="deleteComp(${c.id}, '${escapeHtml(c.name)}')">删除</button>
      </div>
    </div>`).join('') + '</div>';
  list.innerHTML = html;
}

async function deleteComp(id, name) {
  const ok = await confirmDialog(`确定要删除比赛「${escapeHtml(name)}」吗？<br><span class="text-muted">该操作将清除其下全部选手与计分记录，不可恢复。</span>`,
    { danger: true, okText: '确认删除' });
  if (!ok) return;
  try {
    await API.del('/api/competitions/' + id);
    toast('已删除', 'success');
    loadCompetitions();
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- 新建比赛 ---------- */
function openCreateModal() {
  openModal(`
    <div class="modal-head"><h3>新建比赛</h3><button class="close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label>比赛名称 <span class="req">*</span></label><input id="c-name" placeholder="请输入比赛名称"></div>
        <div class="form-group"><label>评委个数 <span class="req">*</span></label><input type="number" id="c-judge" min="1" value="3" placeholder="如 5"></div>
      </div>
      <div class="form-group"><label>备注说明</label><input id="c-desc" placeholder="选填"></div>
      <div class="form-group">
        <label>评分科目 <span class="req">*</span></label>
        <div class="hint mb">至少配置一个科目；科目顺序即录入与计分顺序。</div>
        <div id="subject-list"></div>
        <button class="btn btn-sm mt" onclick="addSubjectRow()">+ 添加科目</button>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitCreate()">创建比赛</button>
    </div>`, { size: 'lg' });
  addSubjectRow();
}

function addSubjectRow(name = '', maxScore = 100) {
  const box = document.getElementById('subject-list');
  const row = document.createElement('div');
  row.className = 'flex gap-sm mt';
  row.style.alignItems = 'center';
  row.innerHTML = `
    <input class="s-name" placeholder="科目名称" value="${escapeHtml(name)}" style="flex:1">
    <input class="s-max" type="number" min="0" step="0.1" value="${maxScore}" style="width:110px" placeholder="满分">
    <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">删除</button>`;
  box.appendChild(row);
}

async function submitCreate() {
  const name = document.getElementById('c-name').value.trim();
  if (!name) { toast('请输入比赛名称', 'error'); return; }
  const judge_count = parseInt(document.getElementById('c-judge').value, 10);
  if (!judge_count || judge_count < 1) { toast('请输入有效的评委个数', 'error'); return; }
  const subjects = collectSubjects();
  if (!subjects) return;
  const body = {
    name,
    judge_count,
    description: document.getElementById('c-desc').value.trim(),
    subjects,
  };
  try {
    await API.post('/api/competitions', body);
    toast('创建成功', 'success');
    closeModal();
    loadCompetitions();
  } catch (err) { toast(err.message, 'error'); }
}

function collectSubjects() {
  const rows = document.querySelectorAll('#subject-list > div');
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
