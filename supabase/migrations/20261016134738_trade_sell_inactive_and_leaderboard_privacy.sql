-- Sells of a deactivated asset must still close an existing position.
-- Buys round up to the cent and require a $1 minimum; sells round down.
-- A full liquidation whose proceeds floor to $0 still settles at $0.01 so the
-- position can be removed (trades.total_amount must stay positive).
-- Leaderboard rows no longer expose user ids, are capped, and ignore scheduled seasons.

create or replace function public.execute_trade(
  p_user_id uuid, p_season_id uuid, p_symbol text, p_side text,
  p_quantity numeric, p_idempotency_key uuid, p_unit_price numeric
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_portfolio uuid; v_balance numeric(20,2); v_old_qty numeric(20,6); v_old_cost numeric(20,6);
  v_gross numeric; v_total numeric(20,2); v_new_balance numeric(20,2); v_trade_id uuid; v_existing public.trades%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_side is null or p_side not in ('buy','sell') then raise exception 'invalid_side' using errcode = '22023'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000000 or p_quantity <> round(p_quantity,6) then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  if p_unit_price is null or p_unit_price <= 0 then raise exception 'invalid_price' using errcode = '22023'; end if;
  if p_idempotency_key is null then raise exception 'idempotency_key_required' using errcode = '22023'; end if;

  select t.* into v_existing from public.trades t join public.portfolios p on p.id=t.portfolio_id
    where p.user_id=p_user_id and p.season_id=p_season_id and t.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.symbol <> p_symbol or v_existing.side <> p_side or v_existing.quantity <> p_quantity then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    select b.balance into v_balance from public.cash_balances b where b.portfolio_id=v_existing.portfolio_id;
    return jsonb_build_object('trade_id',v_existing.id,'symbol',v_existing.symbol,'side',v_existing.side,
      'quantity',v_existing.quantity,'unit_price',v_existing.unit_price,'total',v_existing.total_amount,
      'cash_balance',v_balance,'duplicate',true);
  end if;

  select p.id into v_portfolio from public.portfolios p
    join public.seasons s on s.id=p.season_id
    where p.user_id=p_user_id and p.season_id=p_season_id and s.status='active' and now() between s.starts_at and s.ends_at
    for update of p;
  if not found then raise exception 'portfolio_not_found_or_season_closed' using errcode = 'P0001'; end if;
  select t.* into v_existing from public.trades t where t.portfolio_id=v_portfolio and t.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.symbol <> p_symbol or v_existing.side <> p_side or v_existing.quantity <> p_quantity then raise exception 'idempotency_conflict' using errcode = 'P0001'; end if;
    select b.balance into v_balance from public.cash_balances b where b.portfolio_id=v_existing.portfolio_id;
    return jsonb_build_object('trade_id',v_existing.id,'symbol',v_existing.symbol,'side',v_existing.side,
      'quantity',v_existing.quantity,'unit_price',v_existing.unit_price,'total',v_existing.total_amount,
      'cash_balance',v_balance,'duplicate',true);
  end if;

  v_gross := p_quantity * p_unit_price;
  if p_side = 'buy' then
    if not exists (select 1 from public.assets a where a.symbol = p_symbol and a.active) then
      raise exception 'asset_not_found' using errcode = 'P0001';
    end if;
    v_total := ceil(v_gross * 100) / 100;
    if v_total < 1 then raise exception 'below_minimum_notional' using errcode = '22023'; end if;
  else
    if not exists (select 1 from public.assets a where a.symbol = p_symbol) then
      raise exception 'asset_not_found' using errcode = 'P0001';
    end if;
    v_total := floor(v_gross * 100) / 100;
  end if;

  select b.balance into v_balance from public.cash_balances b where b.portfolio_id=v_portfolio for update;
  if p_side='buy' then
    if v_balance < v_total then raise exception 'insufficient_cash' using errcode = 'P0001'; end if;
    v_new_balance := v_balance - v_total;
    select h.quantity,h.average_cost into v_old_qty,v_old_cost from public.holdings h where h.portfolio_id=v_portfolio and h.symbol=p_symbol for update;
    insert into public.holdings as current_holding(portfolio_id,symbol,quantity,average_cost,updated_at)
      values(v_portfolio,p_symbol,p_quantity,p_unit_price,now())
      on conflict(portfolio_id,symbol) do update set
        average_cost=round(((current_holding.quantity*current_holding.average_cost)+(excluded.quantity*excluded.average_cost))/(current_holding.quantity+excluded.quantity),6),
        quantity=current_holding.quantity+excluded.quantity, updated_at=now();
  else
    select h.quantity,h.average_cost into v_old_qty,v_old_cost from public.holdings h where h.portfolio_id=v_portfolio and h.symbol=p_symbol for update;
    if not found or v_old_qty < p_quantity then raise exception 'insufficient_shares' using errcode = 'P0001'; end if;
    if v_old_qty = p_quantity and v_total < 0.01 then
      v_total := 0.01;
    elsif v_total < 0.01 then
      raise exception 'invalid_total' using errcode = '22003';
    end if;
    v_new_balance := v_balance + v_total;
    if v_old_qty=p_quantity then delete from public.holdings where portfolio_id=v_portfolio and symbol=p_symbol;
    else update public.holdings set quantity=quantity-p_quantity,updated_at=now() where portfolio_id=v_portfolio and symbol=p_symbol;
    end if;
  end if;

  update public.cash_balances set balance=v_new_balance,updated_at=now() where portfolio_id=v_portfolio;
  insert into public.trades(portfolio_id,symbol,side,quantity,unit_price,total_amount,idempotency_key)
    values(v_portfolio,p_symbol,p_side,p_quantity,p_unit_price,v_total,p_idempotency_key) returning id into v_trade_id;
  insert into public.transactions(portfolio_id,trade_id,kind,amount,balance_after)
    values(v_portfolio,v_trade_id,case when p_side='buy' then 'trade_buy' else 'trade_sell' end,
      case when p_side='buy' then -v_total else v_total end,v_new_balance);
  return jsonb_build_object('trade_id',v_trade_id,'symbol',p_symbol,'side',p_side,
    'quantity',p_quantity,'unit_price',p_unit_price,'total',v_total,'cash_balance',v_new_balance,'duplicate',false);
end;
$$;

-- Quote refresh must keep prices fresh for assets players still hold after deactivation.
create or replace function public.publish_quotes(p_quotes jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_quotes) <> 'array' or jsonb_array_length(p_quotes)=0 then
    raise exception 'invalid_quotes' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_quotes) as x(symbol text,price numeric,quoted_at timestamptz,source text)
    where x.price is null or x.price <= 0 or x.quoted_at is null or x.source is null or x.source <> 'simulated') then
    raise exception 'invalid_quotes' using errcode = '22023';
  end if;
  insert into public.asset_quotes(symbol,price,quoted_at,source,updated_at)
    select x.symbol,x.price,x.quoted_at,x.source,now()
    from jsonb_to_recordset(p_quotes) as x(symbol text,price numeric,quoted_at timestamptz,source text)
    join public.assets a on a.symbol=x.symbol
    on conflict(symbol) do update set price=excluded.price,quoted_at=excluded.quoted_at,source=excluded.source,updated_at=now();
  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_quotes) then raise exception 'unknown_asset_in_quotes' using errcode = '22023'; end if;
  insert into public.price_history(symbol,observed_at,price,source)
    select x.symbol,x.quoted_at,x.price,x.source
    from jsonb_to_recordset(p_quotes) as x(symbol text,price numeric,quoted_at timestamptz,source text)
    on conflict(symbol,observed_at) do nothing;
  return v_count;
end;
$$;

drop policy if exists assets_read on public.assets;
create policy assets_read on public.assets for select to authenticated using (
  active
  or exists (
    select 1 from public.holdings h
    join public.portfolios p on p.id = h.portfolio_id
    where h.symbol = public.assets.symbol
      and p.user_id = (select auth.uid())
  )
);

drop function if exists public.get_leaderboard(uuid);
create function public.get_leaderboard(p_season_id uuid)
returns table (display_name text, portfolio_value numeric, rank bigint, is_you boolean, player_count bigint)
language sql stable security definer set search_path = '' as $$
  with valued as (
    select pr.display_name,
      round(b.balance + coalesce(sum(h.quantity * q.price), 0), 2) as portfolio_value,
      dense_rank() over (order by round(b.balance + coalesce(sum(h.quantity * q.price), 0), 2) desc) as rank,
      (p.user_id = (select auth.uid())) as is_you
    from public.portfolios p
    join public.seasons s on s.id = p.season_id
    join public.profiles pr on pr.id = p.user_id
    join public.cash_balances b on b.portfolio_id = p.id
    left join public.holdings h on h.portfolio_id = p.id
    left join public.asset_quotes q on q.symbol = h.symbol
    where p.season_id = p_season_id
      and (select auth.role()) = 'authenticated'
      and s.status in ('active', 'completed')
      and exists (
        select 1 from public.season_participants sp
        where sp.season_id = p.season_id and sp.user_id = (select auth.uid())
      )
    group by p.user_id, pr.display_name, b.balance
  ),
  counted as (
    select v.display_name, v.portfolio_value, v.rank, v.is_you, count(*) over () as player_count
    from valued v
  ),
  caller as (
    select c.rank as caller_rank from counted c where c.is_you limit 1
  )
  select c.display_name, c.portfolio_value, c.rank, c.is_you, c.player_count
  from counted c
  left join caller on true
  where c.rank <= 100
    or c.is_you
    or (caller.caller_rank is not null and c.rank = caller.caller_rank - 1)
  order by c.rank, c.display_name;
$$;
revoke all on function public.get_leaderboard(uuid) from public, anon;
grant execute on function public.get_leaderboard(uuid) to authenticated;
