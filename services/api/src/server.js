'use strict';

const http = require('node:http');
const { createRequestHandler, VERSION } = require('./app');
const { createPostgresPool, verifyDatabaseIdentity } = require('./database/postgres');
const { createLocalIdentityRepository } = require('./auth/localIdentityRepository');
const { createLocalIdentityService } = require('./auth/localIdentityService');

const port = Number(process.env.PORT || 4100);

async function start() {
  const identityProvider = String(
    process.env.AKSHACONNECT_IDENTITY_PROVIDER || 'LOCAL'
  ).trim().toUpperCase();

  let pool = null;
  let localIdentityService = null;

  if (identityProvider === 'LOCAL') {
    pool = createPostgresPool(process.env);
    await verifyDatabaseIdentity(
      pool,
      process.env.AKSHACONNECT_DATABASE_EXPECTED_NAME || 'akshaconnect'
    );

    const repository = createLocalIdentityRepository(pool);
    localIdentityService = createLocalIdentityService(repository, {
      sessionTtlSeconds: process.env.AKSHACONNECT_LOCAL_SESSION_TTL_SECONDS,
    });
  }

  const server = http.createServer(createRequestHandler({ localIdentityService }));

  await new Promise((resolve) => server.listen(port, '0.0.0.0', resolve));
  console.log(`AkshaConnect API ${VERSION} listening on port ${port}`);

  async function shutdown(signal) {
    console.log(`Received ${signal}; shutting down AkshaConnect API`);

    await new Promise((resolve) => {
      server.close(() => resolve());
    });

    if (pool) await pool.end();
  }

  process.on('SIGINT', () => {
    shutdown('SIGINT').catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  });

  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  });
}

start().catch((error) => {
  console.error(`AkshaConnect API startup failed: ${error.code || error.message}`);
  process.exitCode = 1;
});
