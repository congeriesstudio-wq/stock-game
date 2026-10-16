import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createAdminClient } from '../../src/lib/server-auth.js';
import { json, methodNotAllowed } from '../../src/lib/http.js';
import { refreshSimulatedQuotes } from '../../src/prices/refresh.js';

// Trusted scheduler only. Vercel Cron uses GET; a manual scheduler may POST.
// Set CRON_SECRET and send Authorization: Bearer <CRON_SECRET>. Never expose it in the frontend.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') return methodNotAllowed(res, ['GET', 'POST']);
  const expected = process.env.CRON_SECRET ?? '';
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (!expected || expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return json(res, 401, { error: { code: 'unauthorized', message: 'Scheduler credentials are required.' } });
  }
  try {
    const admin = createAdminClient();
    const refreshed = await refreshSimulatedQuotes(admin);
    if (!refreshed.ok) {
      if (refreshed.reason === 'quote_unavailable') return json(res, 503, { error: { code: 'quote_unavailable', message: 'No simulated prices are initialized.' } });
      console.error('quote_publish_error', refreshed.error);
      return json(res, 500, { error: { code: 'quote_publish_failed', message: 'Could not publish simulated prices.' } });
    }
    return json(res, 200, { data: { updated: refreshed.updated, quotedAt: refreshed.quotedAt, source: 'simulated' } });
  } catch (error) {
    console.error('market_refresh_error', error);
    return json(res, 500, { error: { code: 'internal_error', message: 'Market refresh is temporarily unavailable.' } });
  }
}
