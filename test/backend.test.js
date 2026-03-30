const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { buildSessionAggregate } = require('../src/analytics/buildSessionAggregate');
const { getAllSessions } = require('../src/query/sessions');
const { parseSession } = require('../src/server');

const fixturesRoot = path.join(__dirname, 'fixtures', 'projects');

test('buildSessionAggregate keeps mixed-model usage and subagent totals separate', () => {
  const sessionPath = path.join(fixturesRoot, 'sample-project', 'session-mixed.jsonl');
  const session = buildSessionAggregate(sessionPath, {
    windowStartISO: '2026-01-03T10:01:00.000Z',
  });

  assert.equal(session.id, 'session-mixed');
  assert.equal(session.title, 'Investigate mixed model billing');
  assert.equal(session.user_msg_count, 1);
  assert.equal(session.msg_count, 3);
  assert.equal(session.subagent_count, 1);
  assert.equal(session.total_tokens, 865000);
  assert.equal(session.window_tokens, 215000);
  assert.equal(session.api_cost.total, 2.27);
  assert.equal(session.api_cost.input, 0.45);
  assert.equal(session.api_cost.output, 0.93);
  assert.equal(session.subagents.main.total, 810000);
  assert.equal(session.subagents['agent-helper'].total, 55000);
  assert.equal(session.model_stats['claude-sonnet-4-6'].input, 100000);
  assert.equal(session.model_stats['claude-haiku-4-5'].output, 10000);
  assert.equal(session.model_stats['claude-opus-4-6'].cache_create, 5000);
  assert.equal(session.timeline.length, 3);
});

test('buildSessionAggregate excludes idle gaps from active time', () => {
  const sessionPath = path.join(fixturesRoot, 'idle-project', 'session-idle.jsonl');
  const session = buildSessionAggregate(sessionPath);

  assert.equal(session.total_tokens, 300000);
  assert.equal(session.duration_sec, 600);
  assert.equal(session.active_sec, 60);
  assert.equal(session.burn_rate_per_min, 300000);
  assert.equal(session.recent_burn_rate_per_min, 0);
});

test('buildSessionAggregate handles sessions without usage records', () => {
  const sessionPath = path.join(fixturesRoot, 'no-usage-project', 'session-empty.jsonl');
  const session = parseSession(sessionPath);

  assert.equal(session.title, 'Just a title without usage');
  assert.equal(session.duration_sec, 300);
  assert.equal(session.active_sec, 1);
  assert.equal(session.user_msg_count, 1);
  assert.equal(session.msg_count, 0);
  assert.equal(session.total_tokens, 0);
  assert.equal(session.api_cost.total, 0);
  assert.deepEqual(session.timeline, []);
});

test('getAllSessions returns fixture sessions sorted by last timestamp', () => {
  const sessions = getAllSessions(fixturesRoot, 24 * 365, null, null);

  assert.deepEqual(
    sessions.map((session) => session.id),
    ['session-mixed', 'session-idle', 'session-empty']
  );
});
