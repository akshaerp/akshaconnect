'use strict';

const { Pool } = require('pg');
const { boundaryError } = require('../core/boundaryError');

function enabled(value) {
  return ['Y', 'YES', 'TRUE', '1', 'ON'].includes(String(value || '').trim().toUpperCase());
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createPostgresPool(env = process.env) {
  const connectionString = String(env.AKSHACONNECT_DATABASE_URL || '').trim();
  if (!connectionString) {
    throw boundaryError(
      'DATABASE_URL_REQUIRED',
      'AKSHACONNECT_DATABASE_URL is required for the AkshaConnect standalone database',
      500
    );
  }

  return new Pool({
    connectionString,
    max: positiveInt(env.AKSHACONNECT_DATABASE_POOL_MAX, 10),
    ssl: enabled(env.AKSHACONNECT_DATABASE_SSL)
      ? { rejectUnauthorized: true }
      : false,
  });
}

async function verifyDatabaseIdentity(pool, expectedName) {
  const expected = String(expectedName || 'akshaconnect').trim();
  if (!expected) {
    throw boundaryError('DATABASE_EXPECTED_NAME_REQUIRED', 'Expected database name is required', 500);
  }

  const result = await pool.query('SELECT current_database() AS current_database');
  const actual = String(result.rows?.[0]?.current_database || '').trim();

  if (actual !== expected) {
    throw boundaryError(
      'DATABASE_IDENTITY_MISMATCH',
      `AkshaConnect expected PostgreSQL database ${expected} but connected to ${actual || '(unknown)'}`,
      500
    );
  }

  return actual;
}

module.exports = {
  createPostgresPool,
  verifyDatabaseIdentity,
};
