import { normalizeBaseUrl } from '../src/api/client.js';

describe('AkshaConnect mobile API origin', () => {
  test('normalizes a configured server origin', () => {
    expect(normalizeBaseUrl('https://connect.example.com/')).toBe(
      'https://connect.example.com'
    );
  });

  test('requires an explicit HTTP or HTTPS origin', () => {
    expect(() => normalizeBaseUrl('connect.example.com')).toThrow(
      'Server URL must start with http:// or https://'
    );
  });

  test('does not silently default to localhost', () => {
    expect(() => normalizeBaseUrl('')).toThrow(
      'Enter the AkshaConnect server URL'
    );
  });
});
