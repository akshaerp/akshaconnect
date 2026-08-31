'use strict';

const VERSION = '0.6.0-phase0';
const SERVICE_NAME = process.env.AKSHACONNECT_SERVICE_NAME || 'akshaconnect-api';

function writeJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function createRequestHandler() {
  return function requestHandler(req, res) {
    const url = new URL(req.url || '/', 'http://localhost');

    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/ready')) {
      writeJson(res, 200, {
        status: 'ok',
        service: SERVICE_NAME,
        phase: '0',
        checkpoint: 'P0-V6B',
        version: VERSION,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    writeJson(res, 404, {
      status: 'not_found',
      service: SERVICE_NAME,
    });
  };
}

module.exports = {
  VERSION,
  SERVICE_NAME,
  createRequestHandler,
};
