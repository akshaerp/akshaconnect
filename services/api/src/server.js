
'use strict';

const http = require('node:http');
const { createRequestHandler, VERSION } = require('./app');
const { createPostgresPool, verifyDatabaseIdentity } = require('./database/postgres');
const { createLocalIdentityRepository } = require('./auth/localIdentityRepository');
const { createLocalIdentityService } = require('./auth/localIdentityService');
const { createAkshaErpSsoRepository } = require('./auth/akshaErpSsoRepository');
const { createAkshaErpSsoService } = require('./auth/akshaErpSsoService');
const { createAkshaErpSsoHttpHandler } = require('./auth/akshaErpSsoHttpHandler');
const { createAkshaErpHttpAdapters } = require('./integration/erpHttpAdapter');
const { createCollaborationRepository } = require('./collaboration/collaborationRepository');
const { createCollaborationService } = require('./collaboration/collaborationService');
const { createMessagingRepository } = require('./messaging/messagingRepository');
const { createMessagingService } = require('./messaging/messagingService');
const { createMessageCryptoFromEnv } = require('./messaging/messageCrypto');
const { createAttachmentCryptoFromEnv } = require('./attachments/attachmentCrypto');
const { createAttachmentRepository } = require('./attachments/attachmentRepository');
const { createAttachmentService } = require('./attachments/attachmentService');
const { createLocalAttachmentStorage } = require('./attachments/attachmentStorage');
const { createPushRegistrationRepository } = require('./push/pushRegistrationRepository');
const { createPushRegistrationService } = require('./push/pushRegistrationService');
const { createFirebasePushSender } = require('./push/firebasePushSender');
const { createPushDeliveryService } = require('./push/pushDeliveryService');
const { createRealtimeEventBus } = require('./realtime/realtimeEventBus');
const { attachRealtimeGateway } = require('./realtime/realtimeGateway');

const port = Number(process.env.PORT || 4100);

function configuredIdentityProvider() {
  const provider = String(
    process.env.AKSHACONNECT_IDENTITY_PROVIDER || 'LOCAL'
  ).trim().toUpperCase();

  if (!['LOCAL', 'AKSHAERP'].includes(provider)) {
    throw new Error(
      'AKSHACONNECT_IDENTITY_PROVIDER must be LOCAL or AKSHAERP'
    );
  }

  return provider;
}

async function start() {
  const identityProvider = configuredIdentityProvider();

  // Collaboration data is always owned by AkshaConnect, regardless of which
  // external/local provider authenticated the human identity.
  const pool = createPostgresPool(process.env);
  await verifyDatabaseIdentity(
    pool,
    process.env.AKSHACONNECT_DATABASE_EXPECTED_NAME || 'akshaconnect'
  );

  // Existing local identity repository also owns the provider-neutral
  // AkshaConnect ac_session storage. In AKSHAERP mode local credential login
  // is blocked by the SSO HTTP gate, while session verification remains shared.
  const identityRepository = createLocalIdentityRepository(pool);
  const localIdentityService = createLocalIdentityService(identityRepository, {
    sessionTtlSeconds:
      process.env.AKSHACONNECT_LOCAL_SESSION_TTL_SECONDS,
    deviceSessionTtlSeconds:
      process.env.AKSHACONNECT_MOBILE_DEVICE_TTL_SECONDS,
  });

  const collaborationRepository = createCollaborationRepository(pool);
  const collaborationService = createCollaborationService(collaborationRepository);

  const pushRegistrationRepository =
    createPushRegistrationRepository(pool);
  const pushRegistrationService =
    createPushRegistrationService({
      identityRepository,
      pushRegistrationRepository,
    });

  const messageCrypto = createMessageCryptoFromEnv(process.env);
  const messagingRepository = createMessagingRepository(pool, { messageCrypto });

  const firebasePushSender =
    createFirebasePushSender({
      enabled:
        process.env.AKSHACONNECT_FCM_ENABLED,
      projectId:
        process.env.AKSHACONNECT_FIREBASE_PROJECT_ID,
    });

  const pushDeliveryService =
    createPushDeliveryService({
      messagingRepository,
      pushRegistrationRepository,
      pushSender: firebasePushSender,
    });

  const attachmentCrypto = createAttachmentCryptoFromEnv(process.env);
  const attachmentRepository = createAttachmentRepository(pool, { messageCrypto });
  const attachmentStorage = createLocalAttachmentStorage({
    baseDir: process.env.AKSHACONNECT_ATTACHMENT_LOCAL_DIR,
  });
  const realtimeEventBus = createRealtimeEventBus();

  const attachmentService = createAttachmentService({
    messagingRepository,
    attachmentRepository,
    attachmentCrypto,
    storage: attachmentStorage,
    eventPublisher: realtimeEventBus,
    pushPublisher: pushDeliveryService,
  });

  const messagingService = createMessagingService(
    messagingRepository,
    {
      eventPublisher: realtimeEventBus,
      pushPublisher: pushDeliveryService,
      attachmentCleanup: attachmentService,
    }
  );

  let ssoService = null;
  if (identityProvider === 'AKSHAERP') {
    const { identityGateway } = createAkshaErpHttpAdapters({
      baseUrl: process.env.AKSHACONNECT_ERP_BASE_URL,
      apiClientId: process.env.AKSHACONNECT_ERP_API_CLIENT_ID,
      apiKey: process.env.AKSHACONNECT_ERP_API_KEY,
      timeoutMs: process.env.AKSHACONNECT_ERP_TIMEOUT_MS || 5000,
      fetchImpl: global.fetch,
    });

    const ssoRepository = createAkshaErpSsoRepository(pool);
    ssoService = createAkshaErpSsoService({
      identityGateway,
      repository: ssoRepository,
      sessionRepository: identityRepository,
      sessionTtlSeconds:
        process.env.AKSHACONNECT_SSO_SESSION_TTL_SECONDS,
    });
  }

  const appHandler = createRequestHandler({
    localIdentityService,
    collaborationService,
    messagingService,
    attachmentService,
    pushRegistrationService,
  });

  const ssoHttpHandler = createAkshaErpSsoHttpHandler({
    identityProvider,
    ssoService,
    allowedOrigins:
      process.env.AKSHACONNECT_ERP_ALLOWED_ORIGINS,
  });

  const server = http.createServer(async (req, res) => {
    const handled = await ssoHttpHandler(req, res);
    if (handled) return;
    await appHandler(req, res);
  });

  const realtimeGateway = attachRealtimeGateway({
    server,
    localIdentityService,
    messagingRepository,
    eventBus: realtimeEventBus,
  });

  await new Promise((resolve) => server.listen(port, '0.0.0.0', resolve));
  console.log(
    `AkshaConnect API ${VERSION} listening on port ${port} identity_provider=${identityProvider}`
  );

  async function shutdown(signal) {
    console.log(`Received ${signal}; shutting down AkshaConnect API`);

    await realtimeGateway.close();

    await new Promise((resolve) => {
      server.close(() => resolve());
    });

    await pool.end();
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
