'use strict';

class BoundaryError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.name = 'BoundaryError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function boundaryError(code, message, statusCode = 500) {
  return new BoundaryError(code, message, statusCode);
}

module.exports = {
  BoundaryError,
  boundaryError,
};
