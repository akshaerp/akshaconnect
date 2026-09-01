'use strict';

const { boundaryError } = require('../core/boundaryError');

function createLocalIdentityProvider(localIdentityService) {
  if (
    !localIdentityService ||
    typeof localIdentityService.verifyAccessToken !== 'function' ||
    typeof localIdentityService.searchUsers !== 'function'
  ) {
    throw boundaryError(
      'LOCAL_IDENTITY_SERVICE_REQUIRED',
      'AkshaConnect LOCAL identity service is required',
      500
    );
  }

  return Object.freeze({
    verifyAccessToken: (token) => localIdentityService.verifyAccessToken(token),
    searchUsers: (input) => localIdentityService.searchUsers(input),
  });
}

module.exports = {
  createLocalIdentityProvider,
};
