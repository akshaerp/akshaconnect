'use strict';

const http = require('http');
const { createRequestHandler, VERSION } = require('./app');

const port = Number(process.env.PORT || 4100);
const server = http.createServer(createRequestHandler());

server.listen(port, '0.0.0.0', () => {
  // Intentionally minimal: do not log tokens, tenant context, or message payloads.
  console.log(`AkshaConnect API ${VERSION} listening on port ${port}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down AkshaConnect API`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
