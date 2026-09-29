import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && anonKey && serviceKey && process.env.RUN_SUPABASE_INTEGRATION === '1');

describe.skipIf(!enabled)('Supabase trading integration (local project required)', () => {
  let admin: SupabaseClient;
  let userA: SupabaseClient;
  let userB: SupabaseClient;
  let userAId = '';
  let userBId = '';
  let portfolioA = '';
  let seasonId = '';
  let price = '1';

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const password = `Integration-${crypto.randomUUID()}-Aa1!`;
    const [a, b] = await Promise.all([
      admin.auth.admin.createUser({ email: `backend-a-${suffix}@example.test`, password, email_confirm: true }),
      admin.auth.admin.createUser({ email: `backend-b-${suffix}@example.test`, password, email_confirm: true }),
    ]);
    if (a.error || b.error || !a.data.user || !b.data.user) throw new Error('Could not provision integration users');
    userAId = a.data.user.id;
    userBId = b.data.user.id;
    const [sessionA, sessionB] = await Promise.all([
      createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } }).auth.signInWithPassword({ email: a.data.user.email!, password }),
      createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } }).auth.signInWithPassword({ email: b.data.user.email!, password }),
    ]);
    if (sessionA.error || sessionB.error || !sessionA.data.session || !sessionB.data.session) throw new Error('Could not authenticate integration users');
    userA = createClient(url!, anonKey!, { global: { headers: { Authorization: `Bearer ${sessionA.data.session.access_token}` } }, auth: { persistSession: false } });
    userB = createClient(url!, anonKey!, { global: { headers: { Authorization: `Bearer ${sessionB.data.session.access_token}` } }, auth: { persistSession: false } });

    const { data: seasons, error: seasonError } = await admin.from('seasons').select('id').eq('status', 'active').limit(1);
    if (seasonError || !seasons?.[0]) throw new Error('Apply seed.sql before running integration tests');
    seasonId = seasons[0].id;
    const [joinA, joinB] = await Promise.all([
      admin.rpc('join_season', { p_user_id: userAId, p_season_id: seasonId }),
      admin.rpc('join_season', { p_user_id: userBId, p_season_id: seasonId }),
    ]);
    if (joinA.error || joinB.error) throw new Error('Could not join test users to season');
    portfolioA = joinA.data[0].portfolio_id;
    const { data: quote, error: quoteError } = await admin.from('asset_quotes').select('price').eq('symbol', 'AAPL').single();
    if (quoteError || !quote) throw new Error('AAPL simulated quote is required for integration tests');
    price = String(quote.price);
  });

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it('authenticates, trades atomically, enforces idempotency, constraints, and own-row RLS', async () => {
    const key = crypto.randomUUID();
    const buyArgs = { p_user_id: userAId, p_season_id: seasonId, p_symbol: 'AAPL', p_side: 'buy', p_quantity: '2', p_idempotency_key: key, p_unit_price: price };
    const first = await admin.rpc('execute_trade', buyArgs);
    expect(first.error).toBeNull();
    expect(first.data.duplicate).toBe(false);
    const retry = await admin.rpc('execute_trade', buyArgs);
    expect(retry.error).toBeNull();
    expect(retry.data.duplicate).toBe(true);
    expect(retry.data.trade_id).toBe(first.data.trade_id);

    const sell = await admin.rpc('execute_trade', { ...buyArgs, p_side: 'sell', p_quantity: '1', p_idempotency_key: crypto.randomUUID() });
    expect(sell.error).toBeNull();
    const noShares = await admin.rpc('execute_trade', { ...buyArgs, p_side: 'sell', p_quantity: '99', p_idempotency_key: crypto.randomUUID() });
    expect(noShares.error?.message).toContain('insufficient_shares');
    const noCash = await admin.rpc('execute_trade', { ...buyArgs, p_quantity: '1000000', p_idempotency_key: crypto.randomUUID() });
    expect(noCash.error?.message).toContain('insufficient_cash');

    const visible = await userA.from('portfolios').select('id').eq('id', portfolioA);
    expect(visible.data).toHaveLength(1);
    const hidden = await userB.from('portfolios').select('id').eq('user_id', userAId);
    expect(hidden.error).toBeNull();
    expect(hidden.data).toHaveLength(0);
    const balances = await userB.from('cash_balances').select('balance').eq('portfolio_id', portfolioA);
    expect(balances.data).toHaveLength(0);
    const forbiddenRpc = await userA.rpc('execute_trade', buyArgs);
    expect(forbiddenRpc.error).not.toBeNull();

    const negativeBalance = await admin.from('cash_balances').update({ balance: -1 }).eq('portfolio_id', portfolioA);
    expect(negativeBalance.error).not.toBeNull();
    const negativeShares = await admin.from('holdings').insert({ portfolio_id: portfolioA, symbol: 'AAPL', quantity: -1, average_cost: 1 });
    expect(negativeShares.error).not.toBeNull();
  });
});
