'use strict';

const { boundaryError } = require('../core/boundaryError');

function unavailable(method) {
  return async function unavailableErpFeature() {
    throw boundaryError(
      'ERP_FEATURE_UNAVAILABLE',
      `ERP feature ${method} is unavailable because no ERP business provider is configured`,
      501
    );
  };
}

function createUnavailableErpGateway() {
  return Object.freeze({
    lookupRecords: unavailable('lookupRecords'),
    executeAction: unavailable('executeAction'),
  });
}

module.exports = {
  createUnavailableErpGateway,
};
