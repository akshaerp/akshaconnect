'use strict';

const { boundaryError } = require('../core/boundaryError');

function unavailable(method) {
  return async function unavailableBusinessFeature() {
    throw boundaryError(
      'BUSINESS_FEATURE_UNAVAILABLE',
      `Business feature ${method} is unavailable because no business provider is configured`,
      501
    );
  };
}

function createUnavailableBusinessGateway() {
  return Object.freeze({
    searchRecords: unavailable('searchRecords'),
    executeAction: unavailable('executeAction'),
  });
}

module.exports = {
  createUnavailableBusinessGateway,
};
