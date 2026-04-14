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
}

export function renderChart(state, session) {
  const canvas = document.getElementById('timeline-chart');
  if (!canvas || !globalThis.Chart) return;

  destroyChart(state);

  const timeline = session.timeline || [];
  if (timeline.length === 0) return;

  const labels = timeline.map((point) => {
    try {
      return new Date(point.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  });

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
}
