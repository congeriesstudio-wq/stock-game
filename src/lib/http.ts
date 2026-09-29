import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createUserClient } from './supabase.js';

export function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

export async function authenticate(req: VercelRequest, res: VercelResponse) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    json(res, 401, { error: { code: 'unauthorized', message: 'A valid bearer access token is required.' } });
    return null;
  }
  try {
    const client = createUserClient(token);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) {
      json(res, 401, { error: { code: 'unauthorized', message: 'Access token is invalid or expired.' } });
      return null;
    }
    return { user: data.user, client };
  } catch {
    json(res, 500, { error: { code: 'server_misconfigured', message: 'Authentication service is unavailable.' } });
    return null;
  }
}

export function methodNotAllowed(res: VercelResponse, allowed: string[]) {
  res.setHeader('Allow', allowed.join(', '));
  return json(res, 405, { error: { code: 'method_not_allowed', message: `Use ${allowed.join(' or ')}.` } });
}

export function mapDatabaseError(message: string, code?: string) {
  const mappings: Record<string, [number, string]> = {
    insufficient_cash: [409, 'insufficient_cash'],
    insufficient_shares: [409, 'insufficient_shares'],
    asset_not_found: [404, 'asset_not_found'],
    portfolio_not_found_or_season_closed: [409, 'season_unavailable'],
    season_not_active: [409, 'season_unavailable'],
    idempotency_conflict: [409, 'idempotency_conflict'],
    invalid_side: [400, 'invalid_side'],
    invalid_quantity: [400, 'invalid_quantity'],
    invalid_price: [400, 'invalid_price'],
    invalid_total: [400, 'invalid_total'],
  };
  const key = Object.keys(mappings).find((candidate) => message.includes(candidate));
  if (key) return { status: mappings[key][0], code: mappings[key][1], message: key.replaceAll('_', ' ') };
  return { status: code === '42501' ? 403 : 500, code: 'trade_failed', message: 'Trade could not be completed.' };
}
