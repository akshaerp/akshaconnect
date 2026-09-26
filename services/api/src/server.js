'use strict';

const http = require('node:http');
const { createRequestHandler, VERSION } = require('./app');
const { createPostgresPool, verifyDatabaseIdentity } = require('./database/postgres');
const { createLocalIdentityRepository } = require('./auth/localIdentityRepository');
const { createLocalIdentityService } = require('./auth/localIdentityService');
const { createAkshaErpSsoRepository } = require('./auth/akshaErpSsoRepository');
const { createAkshaErpSsoService } = require('./auth/akshaErpSsoService');
const { createAkshaErpSsoHttpHandler } = require('./auth/akshaErpSsoHttpHandler');
const { createWorkspaceSessionRepository } = require('./auth/workspaceSessionRepository');
const { createWorkspaceSessionService } = require('./auth/workspaceSessionService');
const { createWorkspaceSessionHttpHandler } = require('./auth/workspaceSessionHttpHandler');
const { createMobileAuthRepository } = require('./auth/mobileAuthRepository');
const { createMobileAuthService } = require('./auth/mobileAuthService');
const { createMobileAuthHttpHandler } = require('./auth/mobileAuthHttpHandler');
const { createAkshaErpHttpAdapters } = require('./integration/erpHttpAdapter');
const { createAkshaErpDirectoryRepository } = require('./auth/akshaErpDirectoryRepository');
const { createProviderDirectoryService } = require('./auth/providerDirectoryService');
const { createWorkspaceDirectoryHttpHandler } = require('./auth/workspaceDirectoryHttpHandler');
const { createTrustedErpBridgeHttpHandler } = require('./auth/trustedErpBridgeHttpHandler');
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
const { createPresenceRegistry } = require('./realtime/presenceRegistry');
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

  // AkshaConnect owns collaboration state even when a customer delegates human
  // authentication to AkshaERP or another external identity provider.
  const pool = createPostgresPool(process.env);
  await verifyDatabaseIdentity(
    pool,
    process.env.AKSHACONNECT_DATABASE_EXPECTED_NAME || 'akshaconnect'
  );

  // This repository owns provider-neutral access-session storage as well as the
  // legacy LOCAL credential path. External providers never receive LOCAL passwords.
  const identityRepository = createLocalIdentityRepository(pool);
  const localIdentityService = createLocalIdentityService(identityRepository, {
    sessionTtlSeconds:
      process.env.AKSHACONNECT_LOCAL_SESSION_TTL_SECONDS,
    deviceSessionTtlSeconds:
      process.env.AKSHACONNECT_MOBILE_DEVICE_TTL_SECONDS,
  });

  const workspaceSessionRepository = createWorkspaceSessionRepository(pool);
  const workspaceSessionService = createWorkspaceSessionService({
    identityService: localIdentityService,
    repository: workspaceSessionRepository,
  });
  const workspaceSessionHttpHandler = createWorkspaceSessionHttpHandler({
    workspaceSessionService,
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

  // Presence is intentionally ephemeral. It is shared by the realtime gateway
  // and notification router in this API process, and never treated as durable
  // authentication or database state.
  const presenceRegistry =
    createPresenceRegistry();

  const pushDeliveryService =
    createPushDeliveryService({
      messagingRepository,
      pushRegistrationRepository,
      pushSender: firebasePushSender,
      presenceRegistry,
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
  let ssoRepository = null;
  let identityGateway = null;
  let erpDirectoryRepository = null;

  if (identityProvider === 'AKSHAERP') {
    ({ identityGateway } = createAkshaErpHttpAdapters({
      baseUrl: process.env.AKSHACONNECT_ERP_BASE_URL,
      apiClientId: process.env.AKSHACONNECT_ERP_API_CLIENT_ID,
      apiKey: process.env.AKSHACONNECT_ERP_API_KEY,
      timeoutMs: process.env.AKSHACONNECT_ERP_TIMEOUT_MS || 5000,
      fetchImpl: global.fetch,
    }));

    ssoRepository = createAkshaErpSsoRepository(pool);
    ssoService = createAkshaErpSsoService({
      identityGateway,
      repository: ssoRepository,
      sessionRepository: identityRepository,
      sessionTtlSeconds:
        process.env.AKSHACONNECT_SSO_SESSION_TTL_SECONDS,
    });

    erpDirectoryRepository = createAkshaErpDirectoryRepository(pool);
  }

  const mobileAuthRepository = createMobileAuthRepository(pool);
  const mobileAuthService = createMobileAuthService({
    repository: mobileAuthRepository,
    identityGateway,
    ssoRepository,
    sessionRepository: identityRepository,
    authRequestTtlSeconds:
      process.env.AKSHACONNECT_MOBILE_AUTH_REQUEST_TTL_SECONDS,
    deviceTtlSeconds:
      process.env.AKSHACONNECT_MOBILE_DEVICE_TTL_SECONDS,
    accessTtlSeconds:
      process.env.AKSHACONNECT_SSO_SESSION_TTL_SECONDS ||
      process.env.AKSHACONNECT_LOCAL_SESSION_TTL_SECONDS,
  });
  const mobileAuthHttpHandler = createMobileAuthHttpHandler({
    mobileAuthService,
    allowedErpOrigins:
      process.env.AKSHACONNECT_ERP_ALLOWED_ORIGINS,
  });

  const directoryService = createProviderDirectoryService({
    identityProvider,
    localIdentityService,
    identityGateway,
    erpDirectoryRepository,
  });

  const workspaceDirectoryHttpHandler = createWorkspaceDirectoryHttpHandler({
    identityService: localIdentityService,
    directoryService,
    collaborationService,
  });

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

  const trustedErpBridgeHttpHandler = createTrustedErpBridgeHttpHandler({
    identityProvider,
    ssoService,
    identityService: localIdentityService,
    messagingService,
    allowedOrigins:
      process.env.AKSHACONNECT_ERP_ALLOWED_ORIGINS,
  });

  const server = http.createServer(async (req, res) => {
    let handled = await mobileAuthHttpHandler(req, res);
    if (handled) return;

    handled = await trustedErpBridgeHttpHandler(req, res);
    if (handled) return;

    handled = await ssoHttpHandler(req, res);
    if (handled) return;

    handled = await workspaceSessionHttpHandler(req, res);
    if (handled) return;

    handled = await workspaceDirectoryHttpHandler(req, res);
    if (handled) return;

    await appHandler(req, res);
  });

  const realtimeGateway = attachRealtimeGateway({
    server,
    localIdentityService,
    messagingRepository,
    eventBus: realtimeEventBus,
    presenceRegistry,
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
