'use strict';

// This contract belongs to the AkshaERP provider adapter. It is deliberately
// not the shape of the AkshaConnect core business-provider port.
const AKSHAERP_CONNECTOR_CONTRACT_VERSION = '1.0';

const AKSHAERP_CONNECTOR_PATHS = Object.freeze({
  VERIFY_ACCESS_TOKEN: '/api/v1/akshaconnect/identity/verify',
  SEARCH_USERS: '/api/v1/akshaconnect/identity/users/search',
  SEARCH_RECORDS: '/api/v1/akshaconnect/erp/records/search',
  EXECUTE_ACTION: '/api/v1/akshaconnect/erp/actions/execute',
});

// Historical aliases retained for provider-adapter compatibility only.
const ERP_INTEGRATION_CONTRACT_VERSION = AKSHAERP_CONNECTOR_CONTRACT_VERSION;
const ERP_INTEGRATION_PATHS = Object.freeze({
  VERIFY_ACCESS_TOKEN: AKSHAERP_CONNECTOR_PATHS.VERIFY_ACCESS_TOKEN,
  SEARCH_USERS: AKSHAERP_CONNECTOR_PATHS.SEARCH_USERS,
  LOOKUP_RECORDS: AKSHAERP_CONNECTOR_PATHS.SEARCH_RECORDS,
  EXECUTE_ACTION: AKSHAERP_CONNECTOR_PATHS.EXECUTE_ACTION,
});

module.exports = {
  AKSHAERP_CONNECTOR_CONTRACT_VERSION,
  AKSHAERP_CONNECTOR_PATHS,
  ERP_INTEGRATION_CONTRACT_VERSION,
  ERP_INTEGRATION_PATHS,
};
