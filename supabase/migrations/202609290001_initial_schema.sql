-- Stock trading game schema. Apply with: supabase db push
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Trader' check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(left(new.raw_user_meta_data ->> 'display_name', 40), ''), 'Trader'))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  status text not null default 'scheduled' check (status in ('scheduled','active','completed')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  starting_cash numeric(20,2) not null default 100000 check (starting_cash > 0),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index seasons_status_dates_idx on public.seasons(status, starts_at, ends_at);

create table public.assets (
  symbol text primary key check (symbol ~ '^[A-Z][A-Z0-9.]{0,9}$'),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.asset_quotes (
  symbol text primary key references public.assets(symbol),
  price numeric(20,6) not null check (price > 0),
  quoted_at timestamptz not null,
  source text not null check (char_length(source) between 1 and 40),
  updated_at timestamptz not null default now()
);

create table public.price_history (
  id bigint generated always as identity primary key,
  symbol text not null references public.assets(symbol),
  observed_at timestamptz not null,
  price numeric(20,6) not null check (price > 0),
  source text not null,
  unique (symbol, observed_at)
);
create index price_history_symbol_time_idx on public.price_history(symbol, observed_at desc);

create table public.season_participants (
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (season_id, user_id)
);
create index participants_user_idx on public.season_participants(user_id, season_id);

create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (season_id, user_id),
  unique (id, user_id),
  foreign key (season_id, user_id) references public.season_participants(season_id, user_id) on delete cascade
);
create index portfolios_season_idx on public.portfolios(season_id, user_id);

create table public.cash_balances (
  portfolio_id uuid primary key references public.portfolios(id) on delete cascade,
  balance numeric(20,2) not null check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.holdings (
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  symbol text not null references public.assets(symbol),
  quantity numeric(20,6) not null check (quantity > 0),
  average_cost numeric(20,6) not null check (average_cost > 0),
  updated_at timestamptz not null default now(),
  primary key (portfolio_id, symbol)
);
create index holdings_symbol_idx on public.holdings(symbol);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id),
  symbol text not null references public.assets(symbol),
  side text not null check (side in ('buy','sell')),
  quantity numeric(20,6) not null check (quantity > 0),
  unit_price numeric(20,6) not null check (unit_price > 0),
  total_amount numeric(20,2) not null check (total_amount > 0),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (portfolio_id, idempotency_key)
);
create index trades_portfolio_created_idx on public.trades(portfolio_id, created_at desc);
create index trades_symbol_created_idx on public.trades(symbol, created_at desc);

create table public.transactions (
  id bigint generated always as identity primary key,
  portfolio_id uuid not null references public.portfolios(id),
  trade_id uuid unique references public.trades(id),
  kind text not null check (kind in ('trade_buy','trade_sell','adjustment')),
  amount numeric(20,2) not null check (amount <> 0),
  balance_after numeric(20,2) not null check (balance_after >= 0),
  created_at timestamptz not null default now()
);
create index transactions_portfolio_created_idx on public.transactions(portfolio_id, created_at desc);

-- Authenticated clients have read-only access, restricted to their own portfolios where appropriate.
alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.assets enable row level security;
alter table public.asset_quotes enable row level security;
alter table public.price_history enable row level security;
alter table public.season_participants enable row level security;
alter table public.portfolios enable row level security;
alter table public.cash_balances enable row level security;
alter table public.holdings enable row level security;
alter table public.trades enable row level security;
alter table public.transactions enable row level security;

create policy profiles_read_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy seasons_read on public.seasons for select to authenticated using (true);
create policy assets_read on public.assets for select to authenticated using (active);
create policy quotes_read on public.asset_quotes for select to authenticated using (true);
create policy price_history_read on public.price_history for select to authenticated using (true);
create policy participants_read_own on public.season_participants for select to authenticated using (user_id = (select auth.uid()));
create policy portfolios_read_own on public.portfolios for select to authenticated using (user_id = (select auth.uid()));
create policy cash_read_own on public.cash_balances for select to authenticated using (
  exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = (select auth.uid()))
);
create policy holdings_read_own on public.holdings for select to authenticated using (
  exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = (select auth.uid()))
);
create policy trades_read_own on public.trades for select to authenticated using (
  exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = (select auth.uid()))
);
create policy transactions_read_own on public.transactions for select to authenticated using (
  exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = (select auth.uid()))
);

revoke insert, update, delete on public.profiles, public.seasons, public.assets, public.asset_quotes,
  public.price_history, public.season_participants, public.portfolios, public.cash_balances,
  public.holdings, public.trades, public.transactions from anon, authenticated;
grant select on public.profiles, public.seasons, public.assets, public.asset_quotes,
  public.price_history, public.season_participants, public.portfolios, public.cash_balances,
  public.holdings, public.trades, public.transactions to authenticated;
grant update (display_name) on public.profiles to authenticated;

create or replace function public.join_season(p_user_id uuid, p_season_id uuid)
returns table (portfolio_id uuid, cash_balance numeric)
language plpgsql security definer set search_path = '' as $$
declare v_cash numeric(20,2); v_portfolio uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  select s.starting_cash into v_cash from public.seasons s
    where s.id = p_season_id and s.status = 'active' and now() between s.starts_at and s.ends_at;
  if not found then raise exception 'season_not_active' using errcode = 'P0001'; end if;
  insert into public.season_participants(season_id,user_id) values (p_season_id,p_user_id) on conflict do nothing;
  insert into public.portfolios(season_id,user_id) values (p_season_id,p_user_id)
    on conflict (season_id,user_id) do nothing returning id into v_portfolio;
  if v_portfolio is null then select p.id into v_portfolio from public.portfolios p where p.season_id=p_season_id and p.user_id=p_user_id; end if;
  insert into public.cash_balances(portfolio_id,balance) values (v_portfolio,v_cash) on conflict (portfolio_id) do nothing;
  return query select v_portfolio, (select b.balance from public.cash_balances b where b.portfolio_id=v_portfolio);
end;
$$;
revoke all on function public.join_season(uuid,uuid) from public, anon, authenticated;
grant execute on function public.join_season(uuid,uuid) to service_role;

create or replace function public.execute_trade(
  p_user_id uuid, p_season_id uuid, p_symbol text, p_side text,
  p_quantity numeric, p_idempotency_key uuid, p_unit_price numeric
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_portfolio uuid; v_balance numeric(20,2); v_old_qty numeric(20,6); v_old_cost numeric(20,6);
  v_total numeric(20,2); v_new_balance numeric(20,2); v_trade_id uuid; v_existing public.trades%rowtype;
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
  -- Re-check after locking portfolio: concurrent retries serialize here and return the first result.
  select t.* into v_existing from public.trades t where t.portfolio_id=v_portfolio and t.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.symbol <> p_symbol or v_existing.side <> p_side or v_existing.quantity <> p_quantity then raise exception 'idempotency_conflict' using errcode = 'P0001'; end if;
    select b.balance into v_balance from public.cash_balances b where b.portfolio_id=v_existing.portfolio_id;
    return jsonb_build_object('trade_id',v_existing.id,'symbol',v_existing.symbol,'side',v_existing.side,
      'quantity',v_existing.quantity,'unit_price',v_existing.unit_price,'total',v_existing.total_amount,
      'cash_balance',v_balance,'duplicate',true);
  end if;
  if not exists (select 1 from public.assets a where a.symbol=p_symbol and a.active) then
    raise exception 'asset_not_found' using errcode = 'P0001';
  end if;
  v_total := round(p_quantity * p_unit_price, 2);
  if v_total <= 0 then raise exception 'invalid_total' using errcode = '22003'; end if;
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
revoke all on function public.execute_trade(uuid,uuid,text,text,numeric,uuid,numeric) from public, anon, authenticated;
grant execute on function public.execute_trade(uuid,uuid,text,text,numeric,uuid,numeric) to service_role;

create or replace function public.get_leaderboard(p_season_id uuid)
returns table (user_id uuid, display_name text, portfolio_value numeric, rank bigint)
language sql stable security definer set search_path = '' as $$
  select p.user_id, pr.display_name,
    round(b.balance + coalesce(sum(h.quantity*q.price),0),2) as portfolio_value,
    dense_rank() over(order by round(b.balance + coalesce(sum(h.quantity*q.price),0),2) desc) as rank
  from public.portfolios p
  join public.profiles pr on pr.id=p.user_id
  join public.cash_balances b on b.portfolio_id=p.id
  left join public.holdings h on h.portfolio_id=p.id
  left join public.asset_quotes q on q.symbol=h.symbol
  where p.season_id=p_season_id and auth.role()='authenticated'
  group by p.user_id,pr.display_name,b.balance;
$$;
revoke all on function public.get_leaderboard(uuid) from public, anon;
grant execute on function public.get_leaderboard(uuid) to authenticated;

-- Trusted quote ingestion. The web client has no EXECUTE privilege on this function.
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
    join public.assets a on a.symbol=x.symbol and a.active
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
revoke all on function public.publish_quotes(jsonb) from public, anon, authenticated;
grant execute on function public.publish_quotes(jsonb) to service_role;
