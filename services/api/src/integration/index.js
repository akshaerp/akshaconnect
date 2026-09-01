'use strict';

const { createIntegrationBoundaryService } = require('./integrationBoundaryService');
const { PORT_METHODS, assertBoundaryPorts } = require('./portContracts');
const { createConfiguredPorts, isEnabled } = require('./configuredPorts');
const {
  createAkshaErpHttpAdapters,
  createErpHttpAdapters,
} = require('./erpHttpAdapter');
const { createHttpJsonTransport } = require('./httpJsonTransport');
const { signServiceRequest } = require('./serviceToServiceSigner');
const { createLocalIdentityAdapter } = require('./localIdentityAdapter');
const { createUnavailableBusinessGateway } = require('./unavailableBusinessGateway');
const { resolveProviderConfiguration } = require('./providerConfiguration');

module.exports = {
  createIntegrationBoundaryService,
  PORT_METHODS,
  assertBoundaryPorts,
  createConfiguredPorts,
  isEnabled,
  createAkshaErpHttpAdapters,
  createErpHttpAdapters,
  createHttpJsonTransport,
  signServiceRequest,
  createLocalIdentityAdapter,
  createUnavailableBusinessGateway,
  resolveProviderConfiguration,
};
