import { fetchSessions } from './api.js';
import { state } from './state.js';
import { getFilteredSessions, renderSessions } from './renderSessions.js';
import { renderDetail, renderEmptyDetail } from './renderDetail.js';
import { renderShareBar, renderSummary } from './renderSummary.js';

function updateLastUpdate() {
  document.getElementById('last-update').textContent = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function updateAutoRefresh() {
  const hours = parseInt(document.getElementById('hours-select').value, 10);
  const statusEl = document.getElementById('autorefresh-status');

  if (state.autoRefreshInterval) {
    clearInterval(state.autoRefreshInterval);
  }

  if (hours <= 24) {
    state.autoRefreshInterval = setInterval(fetchData, 5000);
    statusEl.textContent = '';
  } else {
    state.autoRefreshInterval = null;
    statusEl.textContent = 'auto-refresh off';
    statusEl.style.color = 'var(--text2)';
  }
}

function scrollSelectedCardIntoView() {
  const card = document.querySelector('.session-card.selected');
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function selectSession(id, options = {}) {
  state.selectedId = id;
  renderSessions(state);
  renderDetail(state);
  if (options.scroll !== false) {
    scrollSelectedCardIntoView();
  }
}

async function copySessionId(titleEl) {
  const sid = titleEl.dataset.sid;
  const tooltip = titleEl.querySelector('.sid-tooltip');

  try {
    await navigator.clipboard.writeText(sid);
    if (!tooltip) return;
    const original = tooltip.textContent;
    tooltip.textContent = 'Copied!';
    tooltip.style.color = 'var(--accent)';
    tooltip.classList.add('show');
    setTimeout(() => {
      tooltip.textContent = original;
      tooltip.style.color = '';
      tooltip.classList.remove('show');
    }, 1200);
  } catch {}
}

async function fetchData() {
  const hours = document.getElementById('hours-select').value;
  const btn = document.getElementById('refresh-btn');

  btn.classList.add('loading');
  try {
    const data = await fetchSessions(hours);
    state.sessions = data.sessions;

    renderSummary(data.summary, state.sessions);
    renderShareBar(state.sessions);
    renderSessions(state);
    updateLastUpdate();

    if (state.selectedId) {
      renderDetail(state);
    } else {
      renderEmptyDetail(state);
    }
  } catch (error) {
    console.error('Fetch error:', error);
  } finally {
    btn.classList.remove('loading');
  }
}

function setupTooltip() {
  const tooltip = document.getElementById('tooltip');

  document.addEventListener('mouseover', (event) => {
    const tip = event.target.closest('[data-tip]');
    if (!tip || !tip.dataset.tip) return;

    tooltip.textContent = tip.dataset.tip;
    tooltip.style.display = 'block';

    const rect = tip.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top - tooltip.offsetHeight - 8;

    if (left + 240 > window.innerWidth) left = window.innerWidth - 250;
    if (left < 8) left = 8;
    if (top < 8) top = rect.bottom + 8;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  });

  document.addEventListener('mouseout', (event) => {
    if (event.target.closest('[data-tip]')) {
      tooltip.style.display = 'none';
    }
  });
}

function setupEventListeners() {
  document.getElementById('refresh-btn').addEventListener('click', fetchData);

  document.getElementById('hours-select').addEventListener('change', () => {
    fetchData();
    updateAutoRefresh();
  });

  document.getElementById('search-input').addEventListener('input', (event) => {
    state.searchQuery = event.target.value;
    renderSessions(state);
  });

  document.getElementById('sort-select').addEventListener('change', (event) => {
    state.sortBy = event.target.value;
    renderSessions(state);
  });

  document.getElementById('session-cards').addEventListener('click', (event) => {
    const title = event.target.closest('.session-title');
    if (title) {
      event.stopPropagation();
      copySessionId(title);
      return;
    }

    const card = event.target.closest('.session-card[data-session-id]');
    if (card) {
      selectSession(card.dataset.sessionId);
    }
  });

  document.getElementById('billing-progress').addEventListener('click', (event) => {
    const fill = event.target.closest('.billing-progress-fill[data-session-id]');
    if (fill) {
      selectSession(fill.dataset.sessionId);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;

    const filtered = getFilteredSessions(state);
    if (filtered.length === 0) return;

    if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      fetchData();
    }

    if (event.key === 'j' || event.key === 'ArrowDown') {
      event.preventDefault();
      const idx = filtered.findIndex((session) => session.id === state.selectedId);
      const next = idx < filtered.length - 1 ? idx + 1 : 0;
      selectSession(filtered[next].id);
    }

    if (event.key === 'k' || event.key === 'ArrowUp') {
      event.preventDefault();
      const idx = filtered.findIndex((session) => session.id === state.selectedId);
      const prev = idx > 0 ? idx - 1 : filtered.length - 1;
      selectSession(filtered[prev].id);
    }

    if (event.key === '/') {
      event.preventDefault();
      document.getElementById('search-input').focus();
    }

    if (event.key === 'Escape') {
      const input = document.getElementById('search-input');
      if (document.activeElement === input) {
        state.searchQuery = '';
        input.value = '';
        input.blur();
        renderSessions(state);
      }
    }

    const timeMap = { 1: '1', 2: '6', 3: '12', 4: '24', 5: '72', 6: '168', 7: '720' };
    if (timeMap[event.key]) {
      document.getElementById('hours-select').value = timeMap[event.key];
      fetchData();
      updateAutoRefresh();
    }
  });
}

setupTooltip();
setupEventListeners();
renderEmptyDetail(state);
fetchData();
updateAutoRefresh();
