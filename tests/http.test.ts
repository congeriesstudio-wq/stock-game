import { describe, expect, it } from 'vitest';
import { bearerToken, mapDatabaseError } from '../src/lib/http.js';

describe('bearer tokens', () => {
  it('accepts any bearer casing and rejects a missing token', () => {
    expect(bearerToken('Bearer secret-token')).toBe('secret-token');
    expect(bearerToken('bearer secret-token')).toBe('secret-token');
    expect(bearerToken('BEARER   secret-token')).toBe('secret-token');
    expect(bearerToken('Basic secret-token')).toBe('');
    expect(bearerToken(undefined)).toBe('');
  });
});

describe('database error mapping', () => {
  it('maps idempotency and forbidden instead of a generic trade failure', () => {
    expect(mapDatabaseError('idempotency_key_required', '22023')).toMatchObject({ status: 400, code: 'idempotency_key_required' });
    expect(mapDatabaseError('forbidden', '42501')).toMatchObject({ status: 403, code: 'forbidden' });
    expect(mapDatabaseError('below_minimum_notional', '22023')).toMatchObject({ status: 400, code: 'below_minimum_notional' });
    expect(mapDatabaseError('invalid_total', '22003')).toMatchObject({ status: 400, code: 'invalid_total' });
  });
});
