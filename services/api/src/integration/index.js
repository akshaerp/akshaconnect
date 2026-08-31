'use strict';

const { createIntegrationBoundaryService } = require('./integrationBoundaryService');
const { PORT_METHODS, assertBoundaryPorts } = require('./portContracts');
const { createConfiguredPorts, isEnabled } = require('./configuredPorts');
const { createErpHttpAdapters } = require('./erpHttpAdapter');
const { createHttpJsonTransport } = require('./httpJsonTransport');
const { signServiceRequest } = require('./serviceToServiceSigner');
const { createLocalIdentityAdapter } = require('./localIdentityAdapter');
const { createUnavailableErpGateway } = require('./unavailableErpGateway');
const { resolveProviderConfiguration } = require('./providerConfiguration');

module.exports = {
  createIntegrationBoundaryService,
  PORT_METHODS,
  assertBoundaryPorts,
  createConfiguredPorts,
  isEnabled,
  createErpHttpAdapters,
  createHttpJsonTransport,
  signServiceRequest,
  createLocalIdentityAdapter,
  createUnavailableErpGateway,
  resolveProviderConfiguration,
};
