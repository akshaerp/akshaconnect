'use strict';

const ERP_INTEGRATION_CONTRACT_VERSION = '1.0';

const ERP_INTEGRATION_PATHS = Object.freeze({
  VERIFY_ACCESS_TOKEN: '/api/v1/akshaconnect/identity/verify',
  SEARCH_USERS: '/api/v1/akshaconnect/identity/users/search',
  LOOKUP_RECORDS: '/api/v1/akshaconnect/erp/records/search',
  EXECUTE_ACTION: '/api/v1/akshaconnect/erp/actions/execute',
});

module.exports = {
  ERP_INTEGRATION_CONTRACT_VERSION,
  ERP_INTEGRATION_PATHS,
};
