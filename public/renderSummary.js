import { esc, fmt, fmtDuration } from './format.js';

const SESSION_COLORS = ['#6c5ce7', '#00b894', '#fdcb6e', '#74b9ff', '#ff6b6b', '#a29bfe', '#55efc4', '#fd79a8'];

export function renderSummary(summary, sessions) {
  document.getElementById('sum-active').textContent = summary.active_sessions;
  document.getElementById('sum-total').textContent = summary.total_sessions;
  document.getElementById('sum-tokens').textContent = fmt(summary.total_tokens);

  const activeTime = sessions.filter((session) => session.is_active).reduce((sum, session) => sum + session.active_sec, 0);
  const totalTime = sessions.reduce((sum, session) => sum + session.active_sec, 0);

  document.getElementById('sum-active-time').textContent = `${fmtDuration(activeTime)} active`;
  document.getElementById('sum-total-time').textContent = `${fmtDuration(totalTime)} active`;

  const apiCost = summary.api_cost;
  if (apiCost) {
    document.getElementById('sum-cost').textContent = `$${apiCost.total.toLocaleString()}`;
    document.getElementById('cost-breakdown').innerHTML =
      `in $${apiCost.input} · out $${apiCost.output} · cr $${apiCost.cache_read} · cw $${apiCost.cache_create}`;
  }
}

export function renderShareBar(sessions) {
  const progress = document.getElementById('billing-progress');
  const total = sessions.reduce((sum, session) => sum + session.total_tokens, 0);

  if (!total || sessions.length === 0) {
    progress.innerHTML = '';
    return;
  }

  const sorted = [...sessions].sort((a, b) => b.total_tokens - a.total_tokens);
  const hours = parseInt(document.getElementById('hours-select').value, 10);
  const minPct = hours <= 24 ? 0.2 : 2;

  let otherTokens = 0;
  let otherCount = 0;
  const significant = [];

  for (const session of sorted) {
    const share = session.total_tokens / total * 100;
    if (share >= minPct) {
      significant.push(session);
    } else {
      otherTokens += session.total_tokens;
      otherCount++;
    }
  }

  let html = significant.map((session, index) => {
    const color = SESSION_COLORS[index % SESSION_COLORS.length];
    const share = session.total_tokens / total * 100;
    const label = share >= 8
      ? `${esc(session.title).slice(0, 20)}${session.title.length > 20 ? '...' : ''}`
      : share >= 3
        ? fmt(session.total_tokens)
        : '';

    return `<div class="billing-progress-fill" data-tip="${esc(session.title)} - ${fmt(session.total_tokens)} (${share.toFixed(1)}%)" data-session-id="${session.id}" style="width:${share}%;background:${color};cursor:pointer">
      ${label ? `<span class="bp-label">${label}</span>` : ''}
    </div>`;
  }).join('');

  if (otherTokens > 0) {
    const otherShare = otherTokens / total * 100;
    html += `<div class="billing-progress-fill" data-tip="${otherCount} smaller sessions - ${fmt(otherTokens)} total (${otherShare.toFixed(1)}%)" style="width:${otherShare}%;background:var(--border);cursor:default">
      ${otherShare >= 3 ? `<span class="bp-label" style="color:var(--text2)">${otherCount} other</span>` : ''}
    </div>`;
  }

  progress.innerHTML = html;
}
