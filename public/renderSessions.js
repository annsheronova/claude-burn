import { esc, fmt, fmtAgo, fmtTime } from './format.js';

export function getFilteredSessions(state) {
  let list = [...state.sessions];

  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    list = list.filter((session) =>
      session.title.toLowerCase().includes(query) || session.project.toLowerCase().includes(query)
    );
  }

  if (state.sortBy === 'tokens') {
    list.sort((a, b) => b.total_tokens - a.total_tokens);
  } else if (state.sortBy === 'burn') {
    list.sort((a, b) => b.recent_burn_rate_per_min - a.recent_burn_rate_per_min);
  } else {
    list.sort((a, b) => (b.last_ts || '').localeCompare(a.last_ts || ''));
  }

  return list;
}

export function renderSessions(state) {
  const container = document.getElementById('session-cards');
  const filtered = getFilteredSessions(state);

  container.innerHTML = filtered.map((session) => {
    const total = session.total_tokens || 1;
    const pIn = (session.input_tokens / total * 100).toFixed(1);
    const pOut = (session.output_tokens / total * 100).toFixed(1);
    const pCR = (session.cache_read_tokens / total * 100).toFixed(1);
    const pCC = (session.cache_create_tokens / total * 100).toFixed(1);

    return `
      <div class="session-card ${session.is_active ? 'active-session' : ''} ${session.id === state.selectedId ? 'selected' : ''}" data-session-id="${session.id}">
        <div class="session-header">
          <div class="session-title" data-sid="${session.id}"><span class="session-title-text">${esc(session.title)}</span><span class="sid-tooltip">${session.id}</span></div>
          <span class="session-badge ${session.is_active ? 'badge-active' : 'badge-idle'}">
            ${session.is_active ? 'ACTIVE' : 'idle'}
          </span>
        </div>
        <div class="project-tag">${esc(session.project)}</div>
        <div class="session-meta">
          <span>${fmtTime(session.first_ts)} - ${fmtTime(session.last_ts)}${session.is_active ? '' : ` · ${fmtAgo(session.last_ts)}`}</span>
          <span>${session.user_msg_count} msgs</span>
          <span>tokens: <span class="highlight">${fmt(session.total_tokens)}</span></span>
          ${session.api_cost ? `<span class="session-cost">$${session.api_cost.total.toFixed(2)}</span>` : ''}
          ${session.user_msg_count > 0 ? `<span>${fmt(Math.round(session.total_tokens / session.user_msg_count))}/msg</span>` : ''}
          ${session.subagent_count > 0 ? `<span>${session.subagent_count} subagents</span>` : ''}
        </div>
        <div class="session-bar">
          <div class="bar-segment bar-input" style="width:${pIn}%"></div>
          <div class="bar-segment bar-output" style="width:${pOut}%"></div>
          <div class="bar-segment bar-cache-read" style="width:${pCR}%"></div>
          <div class="bar-segment bar-cache-create" style="width:${pCC}%"></div>
        </div>
      </div>
    `;
  }).join('');
}
