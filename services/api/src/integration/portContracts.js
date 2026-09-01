'use strict';

const { boundaryError } = require('../core/boundaryError');

const PORT_METHODS = Object.freeze({
  identityGateway: Object.freeze(['verifyAccessToken', 'searchUsers']),
  businessGateway: Object.freeze(['searchRecords', 'executeAction']),
  notificationPort: Object.freeze(['enqueuePush']),
});

function assertPort(name, port) {
  const methods = PORT_METHODS[name];
  if (!methods) {
    throw boundaryError('BOUNDARY_PORT_UNKNOWN', `Unknown boundary port: ${name}`);
  }
  if (!port || typeof port !== 'object') {
    throw boundaryError('BOUNDARY_PORT_REQUIRED', `${name} is required`);
  }

  const missing = methods.filter((method) => typeof port[method] !== 'function');
  if (missing.length) {
    throw boundaryError(
      'BOUNDARY_PORT_INVALID',
      `${name} is missing required method(s): ${missing.join(', ')}`
    );
  }

  return port;
}

function assertBoundaryPorts(ports = {}) {
  return Object.freeze({
    identityGateway: assertPort('identityGateway', ports.identityGateway),
    businessGateway: assertPort('businessGateway', ports.businessGateway),
    notificationPort: assertPort('notificationPort', ports.notificationPort),
  });
}

module.exports = {
  PORT_METHODS,
  assertPort,
  assertBoundaryPorts,
};
