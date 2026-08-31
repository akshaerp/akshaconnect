'use strict';

const { boundaryError } = require('../core/boundaryError');

const PORT_METHODS = Object.freeze({
  identityGateway: Object.freeze(['verifyAccessToken', 'searchUsers']),
  erpGateway: Object.freeze(['lookupRecords', 'executeAction']),
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
    erpGateway: assertPort('erpGateway', ports.erpGateway),
    notificationPort: assertPort('notificationPort', ports.notificationPort),
  });
}

module.exports = {
  PORT_METHODS,
  assertPort,
  assertBoundaryPorts,
};
