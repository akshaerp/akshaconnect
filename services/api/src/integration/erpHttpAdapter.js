'use strict';

const {
  ERP_INTEGRATION_CONTRACT_VERSION,
  ERP_INTEGRATION_PATHS,
} = require('../../../../packages/contracts/src/integrationTransportV1');
const { createHttpJsonTransport } = require('./httpJsonTransport');

function createErpHttpAdapters(options = {}) {
  const transport = createHttpJsonTransport({
    ...options,
    contractVersion: options.contractVersion || ERP_INTEGRATION_CONTRACT_VERSION,
  });

  const identityGateway = Object.freeze({
    verifyAccessToken(accessToken) {
      return transport.request({
        path: ERP_INTEGRATION_PATHS.VERIFY_ACCESS_TOKEN,
        body: {},
        headers: { authorization: `Bearer ${String(accessToken || '')}` },
      });
    },
    searchUsers(input) {
      return transport.request({
        path: ERP_INTEGRATION_PATHS.SEARCH_USERS,
        body: input,
      });
    },
  });

  const erpGateway = Object.freeze({
    lookupRecords(input) {
      return transport.request({
        path: ERP_INTEGRATION_PATHS.LOOKUP_RECORDS,
        body: input,
      });
    },
    executeAction(input) {
      return transport.request({
        path: ERP_INTEGRATION_PATHS.EXECUTE_ACTION,
        body: input,
      });
    },
  });

  return Object.freeze({ identityGateway, erpGateway });
}

module.exports = {
  createErpHttpAdapters,
};
