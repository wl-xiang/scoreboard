/* 历史比赛记录页 */
if (requireLogin()) {
  renderTopbar('history');
  renderSidebar('history');
  loadHistory();
}

async function loadHistory() {
  const host = document.getElementById('history-list');
  host.innerHTML = '<div class="empty"><div class="ico">⏳</div><div class="txt">加载中...</div></div>';
  try {
    const res = await API.get('/api/competitions?status=finished');
    const list = res.data || [];
    if (!list.length) {
      host.innerHTML = `<div class="empty"><div class="ico">📦</div><div class="txt">暂无已结束的比赛记录</div></div>`;
      return;
    }
    host.innerHTML = '<div class="table-wrap"><table class="data">' +
      '<thead><tr><th>比赛名称</th><th>比赛日期</th><th class="num">选手数</th><th class="num">科目数</th><th class="num">评委数</th><th class="num">创建时间</th><th class="num">操作</th></tr></thead><tbody>' +
      list.map(c => `
        <tr>
          <td>${escapeHtml(c.name)}</td>
          <td>${escapeHtml(c.date) || '<span class="text-muted">-</span>'}</td>
          <td class="num">${c.player_count}</td>
          <td class="num">${c.subject_count}</td>
          <td class="num">${c.judge_count || '-'}</td>
          <td class="num">${escapeHtml(c.created_at)}</td>
          <td class="num"><button class="btn btn-sm btn-primary" onclick="location.href='/result.html?id=${c.id}'">查看结果</button></td>
        </tr>`).join('') +
      '</tbody></table></div>';
  } catch (err) {
    host.innerHTML = `<div class="empty"><div class="ico">⚠️</div><div class="txt">${escapeHtml(err.message)}</div></div>`;
  }
}
