/* 比赛结果页：排名展示 + Excel 导出 */
const CID = qs('id');

if (requireLogin() && CID) {
  renderTopbar('history');
  renderSidebar('history');
  loadResult();
} else if (!CID) {
  location.href = '/history.html';
}

async function loadResult() {
  try {
    const [infoRes, lbRes] = await Promise.all([
      API.get('/api/competitions/' + CID),
      API.get('/api/competitions/' + CID + '/leaderboard'),
    ]);
    const c = infoRes.data;
    document.getElementById('r-title').textContent = c.name;
    document.getElementById('r-sub').innerHTML = statusBadge(c.status) +
      (c.remove_max || c.remove_min || c.remove_zero ? ' · <span class="text-muted">已' +
        (c.remove_max ? '去最高 ' : '') + (c.remove_min ? '去最低 ' : '') +
        (c.remove_zero ? '去无效评分 ' : '') + '</span>' : '');

    document.getElementById('r-info').innerHTML = `
      <tr><td style="width:120px;color:var(--muted)">比赛名称</td><td>${escapeHtml(c.name)}</td>
          <td style="width:120px;color:var(--muted)">比赛日期</td><td>${escapeHtml(c.date) || '-'}</td></tr>
      <tr><td style="color:var(--muted)">比赛地点</td><td>${escapeHtml(c.location) || '-'}</td>
          <td style="color:var(--muted)">评委个数</td><td>${c.judge_count || '-'}</td></tr>
      <tr><td style="color:var(--muted)">备注说明</td><td colspan="3">${escapeHtml(c.description) || '-'}</td></tr>`;

    renderResultTable(lbRes.data);
  } catch (err) {
    toast(err.message, 'error');
    document.querySelector('.main').innerHTML = `<div class="empty"><div class="ico">⚠️</div><div class="txt">${escapeHtml(err.message)}</div></div>`;
  }
}

function renderResultTable(d) {
  const judges = d.judges || [];
  const subjects = d.subjects || [];
  const players = d.players || [];

  let h = '<tr><th class="num">名次</th><th class="num">编号</th><th>姓名</th><th>备注</th>';
  judges.forEach(j => { h += `<th class="num">评委${j}</th>`; });
  subjects.forEach(s => { h += `<th class="num">${escapeHtml(s.name)}</th>`; });
  h += '<th class="num">最终得分</th></tr>';
  document.getElementById('r-head').innerHTML = h;

  if (!players.length) {
    document.getElementById('r-body').innerHTML = `<tr><td colspan="${4 + judges.length + subjects.length}" class="text-muted" style="text-align:center;padding:20px">暂无选手数据</td></tr>`;
    return;
  }
  document.getElementById('r-body').innerHTML = players.map(p => {
    let judgeCells = judges.map(j => `<td class="score-cell">${p.judge_totals[String(j)] != null ? p.judge_totals[String(j)] : '-'}</td>`).join('');
    let subjCells = subjects.map(s => `<td class="score-cell">${p.subject_totals[String(s.id)] != null ? p.subject_totals[String(s.id)] : 0}</td>`).join('');
    const cls = p.rank <= 3 ? 'top' + p.rank : '';
    return `<tr class="${cls}">
      <td class="num rank-cell">${rankCell(p.rank)}</td>
      <td class="num">${p.seq}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.remark) || '<span class="text-muted">-</span>'}</td>
      ${judgeCells}${subjCells}
      <td class="num final-score">${p.final_score}</td>
    </tr>`;
  }).join('');
  document.getElementById('r-tip').textContent = '共 ' + players.length + ' 名选手 · 按最终得分降序排列';
}

function exportResult(version) {
  toast('正在生成 Excel 文件...', 'info', 1500);
  downloadAuth('/api/competitions/' + CID + '/export?version=' + version);
}
