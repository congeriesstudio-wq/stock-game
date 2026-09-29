import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticate, json, methodNotAllowed } from '../../src/lib/http.js';
import { z } from 'zod';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const auth = await authenticate(req, res);
  if (!auth) return;
  const seasonId = z.string().uuid().safeParse(req.query.seasonId);
  if (!seasonId.success) return json(res, 400, { error: { code: 'invalid_request', message: 'seasonId UUID query parameter is required.' } });
  const { data, error } = await auth.client.rpc('get_leaderboard', { p_season_id: seasonId.data });
  if (error) {
    console.error('leaderboard_error', error);
    return json(res, 500, { error: { code: 'leaderboard_unavailable', message: 'Could not load the leaderboard.' } });
  }
  return json(res, 200, { data: data ?? [] });
}
