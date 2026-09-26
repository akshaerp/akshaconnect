'use strict';

const DEFAULT_ANDROID_LATEST_VERSION_CODE = 12;
const DEFAULT_ANDROID_MINIMUM_VERSION_CODE = 12;
const DEFAULT_ANDROID_VERSION_NAME = '0.3.0-v12';
const DEFAULT_ANDROID_UPDATE_URL =
  'https://play.google.com/store/apps/details?id=com.akshaerp.akshaconnect';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createMobileVersionPolicyFromEnv(env = process.env) {
  const latestVersionCode = positiveInteger(
    env.AKSHACONNECT_ANDROID_LATEST_VERSION_CODE,
    DEFAULT_ANDROID_LATEST_VERSION_CODE
  );

  const configuredMinimum = positiveInteger(
    env.AKSHACONNECT_ANDROID_MINIMUM_VERSION_CODE,
    DEFAULT_ANDROID_MINIMUM_VERSION_CODE
  );

  const minimumVersionCode = Math.min(
    configuredMinimum,
    latestVersionCode
  );

  const latestVersionName =
    clean(env.AKSHACONNECT_ANDROID_LATEST_VERSION_NAME) ||
    (latestVersionCode === DEFAULT_ANDROID_LATEST_VERSION_CODE
      ? DEFAULT_ANDROID_VERSION_NAME
      : `0.3.0-v${latestVersionCode}`);

  const updateUrl =
    clean(env.AKSHACONNECT_ANDROID_UPDATE_URL) ||
    DEFAULT_ANDROID_UPDATE_URL;

  const releaseNotes =
    clean(env.AKSHACONNECT_ANDROID_RELEASE_NOTES) ||
    'Keep AkshaConnect updated for the latest stability and collaboration improvements.';

  return function mobileVersionPolicy(platformValue = 'ANDROID') {
    const platform = clean(platformValue).toUpperCase() || 'ANDROID';

    if (platform !== 'ANDROID') {
      return {
        platform,
        supported: false,
        latest_version_code: 0,
        latest_version_name: '',
        minimum_version_code: 0,
        update_url: '',
        release_notes: '',
      };
    }

    return {
      platform: 'ANDROID',
      supported: true,
      latest_version_code: latestVersionCode,
      latest_version_name: latestVersionName,
      minimum_version_code: minimumVersionCode,
      update_url: updateUrl,
      release_notes: releaseNotes,
    };
  };
}

module.exports = {
  DEFAULT_ANDROID_LATEST_VERSION_CODE,
  DEFAULT_ANDROID_MINIMUM_VERSION_CODE,
  DEFAULT_ANDROID_VERSION_NAME,
  DEFAULT_ANDROID_UPDATE_URL,
  createMobileVersionPolicyFromEnv,
};
