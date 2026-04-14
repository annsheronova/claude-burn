import { esc, fmt, fmtDuration } from './format.js';
import { destroyChart, renderChart } from './renderChart.js';

function detailEmptyState() {
  return `
    <div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12h4l3-9 4 18 3-9h4"/></svg>
      <p>Select a session to view details</p>
      <span class="hint">Click any session on the left</span>
    </div>
  `;
}

export function renderEmptyDetail(state) {
  const panel = document.getElementById('detail-panel');
  destroyChart(state);
  panel.innerHTML = detailEmptyState();
}

export function renderDetail(state) {
  const session = state.sessions.find((item) => item.id === state.selectedId);
  if (!session) {
    renderEmptyDetail(state);
    return;
  }

  const panel = document.getElementById('detail-panel');
  const recentRate = session.recent_burn_rate_per_min || 0;
  const avgRate = session.burn_rate_per_min || 0;
  const peakRate = Math.max(recentRate, avgRate);

  let alertHtml = '';
  if (peakRate > 0) {
    const level = peakRate > 2_000_000 ? 'high' : peakRate > 500_000 ? 'medium' : 'low';
    alertHtml = `<div class="burn-alert ${level}">
      <div style="display:flex;flex-direction:column;gap:8px;flex:1">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>${recentRate > 0 ? 'Recent (last 3 min)' : 'Recent'} <span class="tip" data-tip="${recentRate > 0 ? 'Token consumption rate in the last 3 real-time minutes. Only shown for active sessions.' : 'Session is idle - no recent activity. The average rate below is based on active time when the session was in use.'}">?</span></span>
          <span class="burn-val">${recentRate > 0 ? fmt(recentRate) : 'idle'}<span style="font-size:12px;font-weight:400">${recentRate > 0 ? '/min' : ''}</span></span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>Average (active time) <span class="tip" data-tip="Total tokens divided by active time only (idle gaps over 2 min excluded). Shows your true average consumption rate when working.">?</span></span>
          <span class="burn-val">${fmt(avgRate)}<span style="font-size:12px;font-weight:400">/min</span></span>
        </div>
      </div>
    </div>`;
  }

  const subs = Object.entries(session.subagents).sort((a, b) => b[1].total - a[1].total);
  const maxSubTotal = Math.max(...subs.map(([, value]) => value.total), 1);

  panel.innerHTML = `
    <h2>${esc(session.title)}</h2>
    ${alertHtml}

    <div class="detail-section">
      <h3>Token Breakdown</h3>
      <div class="token-grid">
        <div class="token-item">
          <div class="label">Input <span class="tip" data-tip="New tokens sent to the API this turn - your message, tool calls, fresh content not yet cached.">?</span></div>
          <div class="val" style="color:var(--blue)">${fmt(session.input_tokens)}</div>
        </div>
        <div class="token-item">
          <div class="label">Output <span class="tip" data-tip="Tokens Claude generated - replies, code, tool decisions. This is the actual work produced.">?</span></div>
          <div class="val" style="color:var(--accent)">${fmt(session.output_tokens)}</div>
        </div>
        <div class="token-item">
          <div class="label">Cache read <span class="tip" data-tip="Each turn re-sends the full conversation history from cache. 10 turns with 300K context = 3M cache read. This is always the biggest number and grows as the conversation gets longer.">?</span></div>
          <div class="val" style="color:var(--green)">${fmt(session.cache_read_tokens)}</div>
        </div>
        <div class="token-item">
          <div class="label">Cache write <span class="tip" data-tip="New content saved to cache after each turn - your latest message, tool results, Claude's reply. These become part of cache read on the next turn.">?</span></div>
          <div class="val" style="color:var(--orange)">${fmt(session.cache_create_tokens)}</div>
        </div>
      </div>
    </div>

    ${session.api_cost ? `
    <div class="detail-section">
      <h3>API Equivalent Cost <span class="tip" data-tip="What this session would cost at API pay-per-token pricing. Calculated per model used (Opus/Sonnet/Haiku have different rates). You pay a flat monthly fee instead.">?</span></h3>
      <div class="cost-total">$${session.api_cost.total.toFixed(2)}</div>
      <div class="cost-breakdown">
        <span>in $${session.api_cost.input.toFixed(2)}</span>
        <span>out $${session.api_cost.output.toFixed(2)}</span>
        <span>cr $${session.api_cost.cache_read.toFixed(2)}</span>
        <span>cw $${session.api_cost.cache_create.toFixed(2)}</span>
      </div>
    </div>
    ` : ''}

    <div class="detail-section">
      <h3>Session Info</h3>
      <div class="token-grid">
        <div class="token-item">
          <div class="label">Duration <span class="tip" data-tip="Total: time from first to last API call. Active: time spent actually working (gaps over 2 min are excluded).">?</span></div>
          <div class="val">${fmtDuration(session.duration_sec)}</div>
          <div style="font-size:10px;color:var(--text2);margin-top:2px">active: ${fmtDuration(session.active_sec)}</div>
        </div>
        <div class="token-item">
          <div class="label">Your messages <span class="tip" data-tip="Messages you typed. Does not count tool calls, subagent requests, or API retries.">?</span></div>
          <div class="val">${session.user_msg_count}</div>
        </div>
        <div class="token-item">
          <div class="label">Model <span class="tip" data-tip="The primary model used. Subagents may use different (cheaper) models like Haiku.">?</span></div>
          <div class="val" style="font-size:12px">${session.model || '?'}</div>
        </div>
        <div class="token-item">
          <div class="label">Avg context size <span class="tip" data-tip="Average tokens consumed per message you sent. Higher = bigger conversation context. Over 500K means you should consider starting a fresh session.">?</span></div>
          <div class="val" style="color:var(--orange)">${session.user_msg_count > 0 ? fmt(Math.round(session.total_tokens / session.user_msg_count)) : '--'}</div>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <h3>Agents (${subs.length})</h3>
      <div class="subagent-list">
        ${subs.map(([name, value]) => {
          const shortModel = (value.model || '').replace('claude-', '').replace(/-\d{8}$/, '');
          const tipText = shortModel ? `${name} | Model: ${shortModel} | ${value.messages} API calls` : `${name} | ${value.messages} API calls`;
          const displayName = name === 'main' ? 'Main session' : `${name.replace('agent-', '').slice(0, 8)}...`;
          return `
          <div class="subagent-row" data-tip="${tipText}">
            <div class="subagent-top">
              <span class="subagent-name">${name === 'main' ? 'Main session' : displayName}</span>
              <span class="subagent-tokens">${fmt(value.total)}</span>
            </div>
            <div class="subagent-bar">
              <div class="subagent-bar-fill" style="width:${(value.total / maxSubTotal * 100).toFixed(1)}%"></div>
            </div>
          </div>
        `;
        }).join('')}
      </div>
    </div>

    <div class="detail-section">
      <h3>Token Timeline</h3>
      <div class="chart-container">
        <canvas id="timeline-chart"></canvas>
      </div>
    </div>

    <div class="detail-section">
      <h3>Context Size <span class="tip" data-tip="Cache read tokens per API call — shows the actual context size sent each turn. Drops indicate /compact or context compression. Lower is cheaper.">?</span></h3>
      <div class="chart-container">
        <canvas id="context-chart"></canvas>
      </div>
    </div>
  `;

  renderChart(state, session);
}
