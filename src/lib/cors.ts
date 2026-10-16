import type { VercelRequest, VercelResponse } from '@vercel/node';

// Default Capacitor WebView origins (Android https scheme, iOS capacitor scheme, legacy http) + local dev.
const NATIVE_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost', 'http://localhost:5173'];

export function allowedOrigins(extra = process.env.ALLOWED_ORIGINS ?? ''): string[] {
  return [...NATIVE_ORIGINS, ...extra.split(',').map((o) => o.trim()).filter(Boolean)];
}

// Sets CORS headers for allowed origins only. Returns true when the request was a preflight and has been answered.
export function handleCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
