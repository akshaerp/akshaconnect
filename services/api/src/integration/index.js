'use strict';

const { createIntegrationBoundaryService } = require('./integrationBoundaryService');
const { PORT_METHODS, assertBoundaryPorts } = require('./portContracts');

module.exports = {
  createIntegrationBoundaryService,
  PORT_METHODS,
  assertBoundaryPorts,
};
