const { createServer } = require('./api/createServer');
const { buildSessionAggregate } = require('./analytics/buildSessionAggregate');
const { getAllSessions } = require('./query/sessions');

module.exports = {
  createServer,
  getAllSessions,
  parseSession: buildSessionAggregate,
};
