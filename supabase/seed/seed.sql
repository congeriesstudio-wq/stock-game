-- Local/demo data only. These symbols and quotes are simulated, not real market data.
insert into public.seasons(name,status,starts_at,ends_at,starting_cash)
values ('Demo Season','active',now() - interval '1 day',now() + interval '90 days',100000.00)
on conflict do nothing;

insert into public.assets(symbol,name,active) values
 ('AAPL','Apple Inc.',true), ('MSFT','Microsoft Corporation',true),
 ('NVDA','NVIDIA Corporation',true), ('TSLA','Tesla, Inc.',true), ('GOOGL','Alphabet Inc.',true)
on conflict (symbol) do update set name=excluded.name, active=excluded.active;

insert into public.asset_quotes(symbol,price,quoted_at,source) values
 ('AAPL',227.520000,now(),'simulated'), ('MSFT',512.410000,now(),'simulated'),
 ('NVDA',184.310000,now(),'simulated'), ('TSLA',412.780000,now(),'simulated'),
 ('GOOGL',251.640000,now(),'simulated')
on conflict(symbol) do update set price=excluded.price,quoted_at=excluded.quoted_at,source=excluded.source,updated_at=now();

insert into public.price_history(symbol,observed_at,price,source)
select q.symbol, now() - (n || ' hours')::interval, round(q.price * (1 + (sin(n::float)*0.012)::numeric),6), 'simulated'
from public.asset_quotes q cross join generate_series(1,48) as n
on conflict(symbol,observed_at) do nothing;
