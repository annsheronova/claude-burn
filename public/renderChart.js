import { fmt } from './format.js';

export function destroyChart(state) {
  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }
  if (state.contextChart) {
    state.contextChart.destroy();
    state.contextChart = null;
  }
  if (state.costChart) {
    state.costChart.destroy();
    state.costChart = null;
  }
}

export function renderChart(state, session) {
  const canvas = document.getElementById('timeline-chart');
  if (!canvas || !globalThis.Chart) return;

  destroyChart(state);

  const timeline = session.timeline || [];
  if (timeline.length === 0) return;

  const labels = [];
  const fullLabels = [];

  for (const point of timeline) {
    try {
      const d = new Date(point.ts);
      labels.push(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      fullLabels.push(d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
    } catch {
      labels.push('');
      fullLabels.push('');
    }
  }

  const data = timeline.map((point) => point.cumulative);

  state.chart = new globalThis.Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 1.5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#e4e4e7',
          titleColor: '#09090b',
          bodyColor: '#09090b',
          bodyFont: { family: "'Geist Mono'", size: 11 },
          titleFont: { family: "'Geist Mono'", size: 10 },
          padding: 8,
          cornerRadius: 6,
          displayColors: false,
          callbacks: {
            title: (items) => fullLabels[items[0]?.dataIndex] || '',
            label: (ctx) => `${fmt(ctx.raw)} tokens`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#52525b', font: { size: 10, family: "'Geist Mono'" }, maxTicksLimit: 6 },
          grid: { color: 'rgba(39,39,42,0.5)' },
          border: { display: false },
        },
        y: {
          ticks: {
            color: '#52525b',
            font: { size: 10, family: "'Geist Mono'" },
            callback: (value) => fmt(value),
          },
          grid: { color: 'rgba(39,39,42,0.3)' },
          border: { display: false },
        },
      },
    },
  });

  // Context size per message chart
  const contextCanvas = document.getElementById('context-chart');
  if (!contextCanvas) return;

  const contextData = timeline.map((point) => point.context || 0);
  const hasContextData = contextData.some((v) => v > 0);
  if (!hasContextData) return;

  state.contextChart = new globalThis.Chart(contextCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: contextData,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 1.5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#e4e4e7',
          titleColor: '#09090b',
          bodyColor: '#09090b',
          bodyFont: { family: "'Geist Mono'", size: 11 },
          titleFont: { family: "'Geist Mono'", size: 10 },
          padding: 8,
          cornerRadius: 6,
          displayColors: false,
          callbacks: {
            title: (items) => fullLabels[items[0]?.dataIndex] || '',
            label: (ctx) => `${fmt(ctx.raw)} context`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#52525b', font: { size: 10, family: "'Geist Mono'" }, maxTicksLimit: 6 },
          grid: { color: 'rgba(39,39,42,0.5)' },
          border: { display: false },
        },
        y: {
          ticks: {
            color: '#52525b',
            font: { size: 10, family: "'Geist Mono'" },
            callback: (value) => fmt(value),
          },
          grid: { color: 'rgba(39,39,42,0.3)' },
          border: { display: false },
        },
      },
    },
  });

  // Per-call chart (tokens by default, toggle to cost)
  const costCanvas = document.getElementById('cost-chart');
  if (!costCanvas) return;

  // Collect unique model short names
  const models = [...new Set(timeline.map((p) => p.model).filter(Boolean))];
  const shortModel = (m) => m.replace('claude-', '').replace(/-\d{8}$/, '');

  function filterData(modelFilter) {
    const filtered = [];
    const filteredLabels = [];
    const filteredFullLabels = [];
    for (let i = 0; i < timeline.length; i++) {
      if (!modelFilter || timeline[i].model === modelFilter) {
        filtered.push(timeline[i]);
        filteredLabels.push(labels[i]);
        filteredFullLabels.push(fullLabels[i]);
      }
    }
    return {
      tokens: filtered.map((p) => p.tokens || 0),
      cost: filtered.map((p) => p.cost || 0),
      labels: filteredLabels,
      fullLabels: filteredFullLabels,
    };
  }

  state._perCallFilter = state._perCallFilter || null;
  state._perCallData = filterData(state._perCallFilter);

  const hasData = timeline.some((p) => (p.tokens || 0) > 0);
  if (!hasData) return;

  function buildPerCallChart(dataSet, mode) {
    return new globalThis.Chart(costCanvas, {
      type: 'line',
      data: {
        labels: dataSet.labels,
        datasets: [{
          data: dataSet[mode],
          borderColor: mode === 'cost' ? '#ef4444' : '#8b5cf6',
          backgroundColor: mode === 'cost' ? 'rgba(239,68,68,0.08)' : 'rgba(139,92,246,0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 1.5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#e4e4e7',
            titleColor: '#09090b',
            bodyColor: '#09090b',
            bodyFont: { family: "'Geist Mono'", size: 11 },
            titleFont: { family: "'Geist Mono'", size: 10 },
            padding: 8,
            cornerRadius: 6,
            displayColors: false,
            callbacks: {
              title: (items) => dataSet.fullLabels[items[0]?.dataIndex] || '',
              label: mode === 'cost'
                ? (ctx) => `$${ctx.raw.toFixed(4)}`
                : (ctx) => `${fmt(ctx.raw)} tokens`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#52525b', font: { size: 10, family: "'Geist Mono'" }, maxTicksLimit: 6 },
            grid: { color: 'rgba(39,39,42,0.5)' },
            border: { display: false },
          },
          y: {
            ticks: {
              color: '#52525b',
              font: { size: 10, family: "'Geist Mono'" },
              callback: mode === 'cost'
                ? (value) => `$${value.toFixed(3)}`
                : (value) => fmt(value),
            },
            grid: { color: 'rgba(39,39,42,0.3)' },
            border: { display: false },
          },
        },
      },
    });
  }

  function rebuildCostChart() {
    state._perCallData = filterData(state._perCallFilter);
    const mode = state.perCallMode || 'tokens';
    if (state.costChart) state.costChart.destroy();
    state.costChart = buildPerCallChart(state._perCallData, mode);
  }

  rebuildCostChart();

  // Model filter select
  const filterSelect = document.getElementById('model-filter');
  if (filterSelect) {
    if (models.length <= 1) {
      filterSelect.disabled = true;
      const opt = document.createElement('option');
      opt.textContent = models.length === 1 ? shortModel(models[0]) : 'all';
      filterSelect.appendChild(opt);
    } else {
      const allOpt = document.createElement('option');
      allOpt.value = '';
      allOpt.textContent = 'all models';
      filterSelect.appendChild(allOpt);
      for (const m of models) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = shortModel(m);
        if (state._perCallFilter === m) opt.selected = true;
        filterSelect.appendChild(opt);
      }
      if (state._perCallFilter) filterSelect.value = state._perCallFilter;
      filterSelect.onchange = () => {
        state._perCallFilter = filterSelect.value || null;
        rebuildCostChart();
      };
    }
  }

  const toggleBtn = document.getElementById('cost-toggle');
  if (toggleBtn) {
    const mode = state.perCallMode || 'tokens';
    toggleBtn.dataset.mode = mode;
    toggleBtn.textContent = mode === 'tokens' ? 'Show $' : 'Show tokens';
    toggleBtn.onclick = () => {
      const current = toggleBtn.dataset.mode;
      const next = current === 'tokens' ? 'cost' : 'tokens';
      state.perCallMode = next;
      toggleBtn.dataset.mode = next;
      toggleBtn.textContent = next === 'tokens' ? 'Show $' : 'Show tokens';
      rebuildCostChart();
    };
  }
}
