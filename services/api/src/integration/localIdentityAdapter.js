'use strict';

const { boundaryError } = require('../core/boundaryError');
const { assertPort } = require('./portContracts');

function createLocalIdentityAdapter(localIdentityProvider) {
  if (!localIdentityProvider) {
    throw boundaryError(
      'LOCAL_IDENTITY_PROVIDER_REQUIRED',
      'LOCAL identity mode requires an AkshaConnect-owned identity provider'
    );
  }

  return assertPort('identityGateway', localIdentityProvider);
}

module.exports = {
  createLocalIdentityAdapter,
};
