import { describe, expect, it } from 'vitest';
import { allowedOrigins, handleCors } from '../src/lib/cors.js';

function fakeRes() {
  const headers: Record<string, string> = {};
  const res: any = { headers, setHeader: (k: string, v: string) => { headers[k] = v; }, status(c: number) { res.code = c; return res; }, end() { res.ended = true; } };
  return res;
}

describe('cors', () => {
  it('allows Android WebView origin and answers preflight', () => {
    const res = fakeRes();
    expect(handleCors({ method: 'OPTIONS', headers: { origin: 'https://localhost' } } as any, res)).toBe(true);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://localhost');
    expect(res.code).toBe(204);
  });
  it('does not grant unknown origins and passes normal requests through', () => {
    const res = fakeRes();
    expect(handleCors({ method: 'POST', headers: { origin: 'https://evil.example' } } as any, res)).toBe(false);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
  it('supports extra origins from env', () => {
    expect(allowedOrigins('https://a.app, https://b.app')).toContain('https://b.app');
  });
});
