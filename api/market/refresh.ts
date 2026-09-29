import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createAdminClient } from '../../src/lib/server-auth.js';
import { json, methodNotAllowed } from '../../src/lib/http.js';

// Intended for a trusted scheduler only. Set CRON_SECRET in Vercel and invoke with
// Authorization: Bearer <CRON_SECRET>; never expose it in the frontend.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const expected = process.env.CRON_SECRET ?? '';
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (!expected || expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return json(res, 401, { error: { code: 'unauthorized', message: 'Scheduler credentials are required.' } });
  }
  try {
    const admin = createAdminClient();
    const { data: quotes, error: readError } = await admin.from('asset_quotes').select('symbol,price');
    if (readError || !quotes?.length) return json(res, 503, { error: { code: 'quote_unavailable', message: 'No simulated prices are initialized.' } });
    const quotedAt = new Date().toISOString();
    const updates = quotes.map((quote) => {
      // Bounded random walk: each refresh moves the simulated market at most +/-0.2%.
      const next = Math.max(0.01, Number(quote.price) * (1 + (Math.random() - 0.5) * 0.004));
      return { symbol: quote.symbol, price: next.toFixed(6), quoted_at: quotedAt, source: 'simulated' };
    });
    const { data, error } = await admin.rpc('publish_quotes', { p_quotes: updates });
    if (error) {
      console.error('quote_publish_error', error);
      return json(res, 500, { error: { code: 'quote_publish_failed', message: 'Could not publish simulated prices.' } });
    }
    return json(res, 200, { data: { updated: data, quotedAt, source: 'simulated' } });
  } catch (error) {
    console.error('market_refresh_error', error);
    return json(res, 500, { error: { code: 'internal_error', message: 'Market refresh is temporarily unavailable.' } });
  }
}
