'use strict';

const {
  applicationDefault,
  getApps,
  initializeApp,
} = require('firebase-admin/app');

const {
  getMessaging,
} = require('firebase-admin/messaging');

const MAX_MULTICAST_TOKENS = 500;

function clean(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}

function enabledValue(value) {
  return [
    '1',
    'Y',
    'YES',
    'TRUE',
    'ON',
  ].includes(
    clean(value).toUpperCase()
  );
}

function chunk(values, size) {
  const result = [];

  for (
    let index = 0;
    index < values.length;
    index += size
  ) {
    result.push(
      values.slice(
        index,
        index + size
      )
    );
  }

  return result;
}

function createFirebasePushSender({
  enabled = false,
  projectId = '',
} = {}) {
  const active =
    typeof enabled === 'boolean'
      ? enabled
      : enabledValue(enabled);

  let messagingInstance = null;

  function resolveMessaging() {
    if (!active) {
      return null;
    }

    if (messagingInstance) {
      return messagingInstance;
    }

    let app =
      getApps()?.[0] ||
      null;

    if (!app) {
      const options = {
        credential:
          applicationDefault(),
      };

      const cleanProjectId =
        clean(projectId);

      if (cleanProjectId) {
        options.projectId =
          cleanProjectId;
      }

      app =
        initializeApp(options);
    }

    messagingInstance =
      getMessaging(app);

    return messagingInstance;
  }

  async function send({
    tokens = [],
    notification = {},
    data = {},
  } = {}) {
    const uniqueTokens =
      [...new Set(
        (tokens || [])
          .map((token) =>
            clean(token)
          )
          .filter(Boolean)
      )];

    if (
      !active ||
      uniqueTokens.length === 0
    ) {
      return {
        enabled: active,
        attempted: 0,
        success_count: 0,
        failure_count: 0,
        invalid_tokens: [],
      };
    }

    const messaging =
      resolveMessaging();

    const invalidTokens = [];
    let successCount = 0;
    let failureCount = 0;

    const conversationId =
      clean(
        data?.conversationId ||
        data?.conversation_id
      );

    const androidNotification = {
      channelId:
        'akshaconnect-messages-v1',

      icon:
        'ic_notification',

      sound:
        'default',
    };

    if (conversationId) {
      androidNotification.tag =
        `akshaconnect-conversation-${conversationId}`;
    }

    for (
      const tokenBatch of
      chunk(
        uniqueTokens,
        MAX_MULTICAST_TOKENS
      )
    ) {
      const response =
        await messaging
          .sendEachForMulticast({
            tokens: tokenBatch,

            notification: {
              title:
                clean(
                  notification.title
                ) ||
                'AkshaConnect',

              body:
                clean(
                  notification.body
                ) ||
                'New message',
            },

            data: Object.fromEntries(
              Object.entries(data || {})
                .map(
                  ([key, value]) => [
                    String(key),
                    String(
                      value ??
                      ''
                    ),
                  ]
                )
            ),

            android: {
              priority: 'high',
              notification:
                androidNotification,
            },
          });

      successCount +=
        Number(
          response.successCount ||
          0
        );

      failureCount +=
        Number(
          response.failureCount ||
          0
        );

      response.responses
        .forEach(
          (item, index) => {
            if (item.success) {
              return;
            }

            const code =
              clean(
                item.error?.code
              );

            if (
              code ===
                'messaging/registration-token-not-registered' ||
              code ===
                'messaging/invalid-registration-token' ||
              code ===
                'messaging/invalid-argument'
            ) {
              invalidTokens.push(
                tokenBatch[index]
              );
            }
          }
        );
    }

    return {
      enabled: true,
      attempted:
        uniqueTokens.length,
      success_count:
        successCount,
      failure_count:
        failureCount,
      invalid_tokens:
        invalidTokens,
    };
  }

  return Object.freeze({
    enabled: active,
    send,
  });
}

module.exports = {
  MAX_MULTICAST_TOKENS,
  createFirebasePushSender,
};
