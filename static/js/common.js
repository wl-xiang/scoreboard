/* ===================================================================
   通用工具：Token 管理、Fetch 封装、Toast、模态框、确认对话框
   =================================================================== */

const TOKEN_KEY = 'qyjx_scoring_token';
const USER_KEY = 'qyjx_scoring_user';

const Auth = {
  getToken() { return localStorage.getItem(TOKEN_KEY) || ''; },
  setToken(token, username) {
    localStorage.setItem(TOKEN_KEY, token);
    if (username) localStorage.setItem(USER_KEY, username);
  },
  clear() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); },
  getUsername() { return localStorage.getItem(USER_KEY) || ''; },
  isLoggedIn() { return !!this.getToken(); },
};

/* 统一的 API 请求封装，自动附带鉴权头，401 自动跳登录 */
async function api(url, options = {}) {
  options.headers = options.headers || {};
  if (options.body && typeof options.body === 'string' && !options.headers['Content-Type']) {
    options.headers['Content-Type'] = 'application/json';
  }
  const token = Auth.getToken();
  if (token) options.headers['Authorization'] = 'Bearer ' + token;

  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    throw new Error('网络请求失败，请检查服务是否正常');
  }
  if (res.status === 401) {
    Auth.clear();
    location.href = '/';
    throw new Error('未登录或登录已失效');
  }
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    data = await res.json();
  }
  if (!res.ok) {
    const msg = (data && data.message) || ('请求失败(' + res.status + ')');
    if (data && data.code === 401) { Auth.clear(); location.href = '/'; }
    throw new Error(msg);
  }
  return data;
}

const API = {
  get: (u) => api(u, { method: 'GET' }),
  post: (u, body) => api(u, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: (u, body) => api(u, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: (u, body) => api(u, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
};

/* 带鉴权的文件下载（通过 blob 触发） */
async function downloadAuth(url) {
  const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + Auth.getToken() } });
  if (res.status === 401) { Auth.clear(); location.href = '/'; return; }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    toast(d.message || '下载失败', 'error');
    return;
  }
  const blob = await res.blob();
  const disp = res.headers.get('content-disposition') || '';
  let fname = 'download.xlsx';
  const m = disp.match(/filename\*?=([^;]+)/);
  if (m) { fname = decodeURIComponent(m[1].replace(/^[^']*'|"/g, '')); }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function qs(name) { return new URLSearchParams(location.search).get(name); }

/* 登录守卫：页面加载时调用，未登录跳转登录页 */
function requireLogin() {
  if (!Auth.isLoggedIn()) { location.href = '/'; return false; }
  return true;
}

function logout() {
  API.post('/api/logout').catch(() => {}).finally(() => {
    Auth.clear();
    location.href = '/';
  });
}

/* ---------- Toast 提示 ---------- */
function toast(msg, type = 'info', duration = 2500) {
  let box = document.getElementById('toast-box');
  if (!box) { box = document.createElement('div'); box.id = 'toast-box'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = msg;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* ---------- 模态框 ---------- */
function openModal(html, opts = {}) {
  let mask = document.getElementById('global-modal');
  if (!mask) {
    mask = document.createElement('div');
    mask.id = 'global-modal';
    mask.className = 'modal-mask';
    document.body.appendChild(mask);
    mask.addEventListener('click', (e) => { if (e.target === mask) closeModal(); });
  }
  mask.innerHTML = '<div class="modal-box ' + (opts.size || '') + '">' + html + '</div>';
  mask.classList.add('open');
  document.body.style.overflow = 'hidden';
  return mask;
}
function closeModal() {
  const mask = document.getElementById('global-modal');
  if (mask) { mask.classList.remove('open'); mask.innerHTML = ''; }
  document.body.style.overflow = '';
}

/* ---------- 确认对话框（返回 Promise<boolean>） ---------- */
function confirmDialog(message, opts = {}) {
  return new Promise((resolve) => {
    const title = opts.title || '操作确认';
    const okText = opts.okText || '确定';
    const cancelText = opts.cancelText || '取消';
    const okClass = opts.danger ? 'btn btn-danger' : 'btn btn-primary';
    openModal(`
      <div class="modal-head"><h3>${title}</h3><button class="close" data-act="cancel">×</button></div>
      <div class="modal-body">${message}</div>
      <div class="modal-foot">
        <button class="btn" data-act="cancel">${cancelText}</button>
        <button class="${okClass}" data-act="ok">${okText}</button>
      </div>`, { size: opts.size || '' });
    const mask = document.getElementById('global-modal');
    mask.querySelectorAll('[data-act]').forEach(b => {
      b.addEventListener('click', () => { closeModal(); resolve(b.dataset.act === 'ok'); });
    });
  });
}

/* 顶部导航栏渲染（除登录页外通用） */
function renderTopbar(active) {
  const host = document.getElementById('topbar');
  if (!host) return;
  host.innerHTML = `
    <div class="brand">
      <span class="logo">🏆</span>
      <span>比赛计分管理系统</span>
    </div>
    <div class="user-area">
      <span class="uname">👤 ${escapeHtml(Auth.getUsername() || '管理员')}</span>
      <button class="btn btn-sm btn-ghost" style="color:#fff" onclick="logout()">退出登录</button>
    </div>`;
}

/* 侧边栏渲染 */
function renderSidebar(active) {
  const host = document.getElementById('sidebar');
  if (!host) return;
  host.innerHTML = `
    <div class="nav-section">主菜单</div>
    <a class="nav-item ${active==='home'?'active':''}" href="/index.html">
      <span class="ico">📋</span><span>比赛列表</span></a>
    <div class="nav-section">数据</div>
    <a class="nav-item ${active==='history'?'active':''}" href="/history.html">
      <span class="ico">📦</span><span>历史比赛记录</span></a>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function statusBadge(status) {
  const map = {
    draft: ['badge-draft', '未开始'],
    ongoing: ['badge-ongoing', '进行中'],
    finished: ['badge-finished', '已结束'],
  };
  const [cls, txt] = map[status] || ['badge-draft', status];
  return `<span class="badge ${cls}">${txt}</span>`;
}

function rankCell(rank) {
  if (rank === 1) return `<span class="rank-medal rank-1">1</span>`;
  if (rank === 2) return `<span class="rank-medal rank-2">2</span>`;
  if (rank === 3) return `<span class="rank-medal rank-3">3</span>`;
  return `<span class="rank-medal rank-other">${rank}</span>`;
}
