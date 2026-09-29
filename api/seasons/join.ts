import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticate, json, methodNotAllowed } from '../../src/lib/http.js';
import { createAdminClient } from '../../src/lib/server-auth.js';
import { joinSeasonSchema } from '../../src/lib/validation.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const auth = await authenticate(req, res);
  if (!auth) return;
  const parsed = joinSeasonSchema.safeParse(req.body);
  if (!parsed.success) return json(res, 400, { error: { code: 'invalid_request', message: 'Provide a valid seasonId UUID.' } });
  try {
    const { data, error } = await createAdminClient().rpc('join_season', {
      p_user_id: auth.user.id,
      p_season_id: parsed.data.seasonId,
    });
    if (error) {
      const unavailable = error.message.includes('season_not_active');
      return json(res, unavailable ? 409 : 500, { error: {
        code: unavailable ? 'season_unavailable' : 'join_failed',
        message: unavailable ? 'This season is not currently accepting participants.' : 'Could not join the season.',
      } });
    }
    return json(res, 200, { data: data?.[0] });
  } catch (error) {
    console.error('join_season_error', error);
    return json(res, 500, { error: { code: 'internal_error', message: 'Season service is temporarily unavailable.' } });
  }
}
