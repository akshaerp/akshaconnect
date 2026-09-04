
'use strict';

const http = require('node:http');
const { createRequestHandler, VERSION } = require('./app');
const { createPostgresPool, verifyDatabaseIdentity } = require('./database/postgres');
const { createLocalIdentityRepository } = require('./auth/localIdentityRepository');
const { createLocalIdentityService } = require('./auth/localIdentityService');
const { createCollaborationRepository } = require('./collaboration/collaborationRepository');
const { createCollaborationService } = require('./collaboration/collaborationService');
const { createMessagingRepository } = require('./messaging/messagingRepository');
const { createMessagingService } = require('./messaging/messagingService');
const { createMessageCryptoFromEnv } = require('./messaging/messageCrypto');
const { createAttachmentCryptoFromEnv } = require('./attachments/attachmentCrypto');
const { createAttachmentRepository } = require('./attachments/attachmentRepository');
const { createAttachmentService } = require('./attachments/attachmentService');
const { createLocalAttachmentStorage } = require('./attachments/attachmentStorage');
const { createRealtimeEventBus } = require('./realtime/realtimeEventBus');
const { attachRealtimeGateway } = require('./realtime/realtimeGateway');

const port = Number(process.env.PORT || 4100);

async function start() {
  const identityProvider = String(
    process.env.AKSHACONNECT_IDENTITY_PROVIDER || 'LOCAL'
  ).trim().toUpperCase();

  let pool = null;
  let localIdentityService = null;
  let collaborationService = null;
  let messagingRepository = null;
  let messagingService = null;
  let attachmentService = null;
  let realtimeGateway = null;
  const realtimeEventBus = createRealtimeEventBus();

  if (identityProvider === 'LOCAL') {
    pool = createPostgresPool(process.env);
    await verifyDatabaseIdentity(
      pool,
      process.env.AKSHACONNECT_DATABASE_EXPECTED_NAME || 'akshaconnect'
    );

    const identityRepository = createLocalIdentityRepository(pool);
    localIdentityService = createLocalIdentityService(identityRepository, {
      sessionTtlSeconds: process.env.AKSHACONNECT_LOCAL_SESSION_TTL_SECONDS,
    });

    const collaborationRepository = createCollaborationRepository(pool);
    collaborationService = createCollaborationService(collaborationRepository);

    const messageCrypto = createMessageCryptoFromEnv(process.env);
    messagingRepository = createMessagingRepository(pool, { messageCrypto });
    messagingService = createMessagingService(messagingRepository, {
      eventPublisher: realtimeEventBus,
    });

    const attachmentCrypto = createAttachmentCryptoFromEnv(process.env);
    const attachmentRepository = createAttachmentRepository(pool, { messageCrypto });
    const attachmentStorage = createLocalAttachmentStorage({
      baseDir: process.env.AKSHACONNECT_ATTACHMENT_LOCAL_DIR,
    });
    attachmentService = createAttachmentService({
      messagingRepository,
      attachmentRepository,
      attachmentCrypto,
      storage: attachmentStorage,
      eventPublisher: realtimeEventBus,
    });
  }

  const server = http.createServer(createRequestHandler({
    localIdentityService,
    collaborationService,
    messagingService,
    attachmentService,
  }));

  if (localIdentityService && messagingRepository) {
    realtimeGateway = attachRealtimeGateway({
      server,
      localIdentityService,
      messagingRepository,
      eventBus: realtimeEventBus,
    });
  }

  await new Promise((resolve) => server.listen(port, '0.0.0.0', resolve));
  console.log(`AkshaConnect API ${VERSION} listening on port ${port}`);

  async function shutdown(signal) {
    console.log(`Received ${signal}; shutting down AkshaConnect API`);

    if (realtimeGateway) await realtimeGateway.close();

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
