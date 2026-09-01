'use strict';

const {
  AKSHAERP_CONNECTOR_PATHS,
} = require('../../../../packages/contracts/src/integrationTransportV1');
const { createHttpJsonTransport } = require('./httpJsonTransport');

function createAkshaErpHttpAdapters(options = {}) {
  const transport = createHttpJsonTransport(options);

  const identityGateway = Object.freeze({
    verifyAccessToken(accessToken) {
      return transport.request({
        path: AKSHAERP_CONNECTOR_PATHS.VERIFY_ACCESS_TOKEN,
        body: {},
        headers: { authorization: `Bearer ${String(accessToken || '')}` },
      });
    },
    searchUsers(input) {
      return transport.request({
        path: AKSHAERP_CONNECTOR_PATHS.SEARCH_USERS,
        body: input,
      });
    },
  });

  const businessGateway = Object.freeze({
    searchRecords(input) {
      return transport.request({
        path: AKSHAERP_CONNECTOR_PATHS.SEARCH_RECORDS,
        body: input,
      });
    },
    executeAction(input) {
      return transport.request({
        path: AKSHAERP_CONNECTOR_PATHS.EXECUTE_ACTION,
        body: input,
      });
    },
  });

  return Object.freeze({ identityGateway, businessGateway });
}

// Transitional provider-specific alias for code written before P0-V6D.
// AkshaConnect core no longer depends on this name or on an ERP-shaped port.
const createErpHttpAdapters = createAkshaErpHttpAdapters;

module.exports = {
  createAkshaErpHttpAdapters,
  createErpHttpAdapters,
};
