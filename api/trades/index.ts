import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticate, json, mapDatabaseError, methodNotAllowed } from '../../src/lib/http.js';
import { createAdminClient } from '../../src/lib/server-auth.js';
import { tradeRequestSchema } from '../../src/lib/validation.js';
import { SupabaseQuoteProvider } from '../../src/prices/provider.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const auth = await authenticate(req, res);
  if (!auth) return;

  const parsed = tradeRequestSchema.safeParse(req.body);
  if (!parsed.success) return json(res, 400, {
    error: { code: 'invalid_request', message: 'Request validation failed.', details: parsed.error.flatten() },
  });
  const input = parsed.data;

  try {
    const admin = createAdminClient();
    const maxAge = Number(process.env.QUOTE_MAX_AGE_SECONDS ?? 900);
    const prices = new SupabaseQuoteProvider(admin, Number.isFinite(maxAge) ? maxAge : 900);
    let quote;
    try {
      quote = await prices.getCurrentPrice(input.symbol);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'quote_unavailable';
      const stale = reason === 'quote_stale';
      return json(res, stale ? 503 : 404, { error: {
        code: stale ? 'quote_stale' : 'quote_unavailable',
        message: stale ? 'The latest market quote is too old. Retry after the price feed updates.' : 'No current quote is available for this asset.',
      } });
    }

    const { data, error } = await admin.rpc('execute_trade', {
      p_user_id: auth.user.id,
      p_season_id: input.seasonId,
      p_symbol: input.symbol,
      p_side: input.side,
      p_quantity: input.quantity,
      p_idempotency_key: input.idempotencyKey,
      p_unit_price: quote.price,
    });
    if (error) {
      const mapped = mapDatabaseError(error.message, error.code);
      return json(res, mapped.status, { error: { code: mapped.code, message: mapped.message } });
    }
    return json(res, 200, { data: { ...data, quote: { price: quote.price, quotedAt: quote.quotedAt, source: quote.source } } });
  } catch (error) {
    console.error('trade_api_error', error);
    return json(res, 500, { error: { code: 'internal_error', message: 'Trade service is temporarily unavailable.' } });
  }
}
