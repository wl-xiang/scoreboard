/* 登录页逻辑 */
(function () {
  // 已登录则直接进入主页
  if (Auth.isLoggedIn()) { location.href = '/index.html'; return; }

  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const btn = document.getElementById('login-btn');
    if (!username || !password) { toast('请输入用户名和密码', 'error'); return; }
    btn.disabled = true; btn.textContent = '登录中...';
    try {
      const res = await API.post('/api/login', { username, password });
      Auth.setToken(res.data.token, res.data.username || username);
      toast('登录成功', 'success');
      setTimeout(() => location.href = '/index.html', 300);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false; btn.textContent = '登 录';
    }
  });
})();
