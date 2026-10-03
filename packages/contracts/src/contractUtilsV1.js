'use strict';

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function hasValue(value) {
  return clean(value) !== null;
}

function requireText(value, fieldName, errors) {
  const text = clean(value);
  if (!text) errors.push(`${fieldName} is required`);
  return text;
}

function normalizeCode(value) {
  const text = clean(value);
  return text ? text.toUpperCase() : null;
}

module.exports = {
  clean,
  hasValue,
  requireText,
  normalizeCode,
};
