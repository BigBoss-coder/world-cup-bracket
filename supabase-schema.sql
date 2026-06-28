create extension if not exists pgcrypto;

create table if not exists pools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  admin_token text not null,
  created_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  display_name text not null,
  edit_token text not null unique,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  external_id text,
  round_name text not null,
  round_index int not null,
  slot int not null,
  team_a text,
  team_b text,
  starts_at timestamptz,
  winner text,
  unique(pool_id, round_index, slot)
);

create table if not exists picks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  picked_winner text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(player_id, match_id)
);

alter table pools enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table picks enable row level security;

revoke all on pools from anon, authenticated;
grant select (id, name, slug, created_at) on pools to anon, authenticated;
revoke all on players from anon, authenticated;
grant insert (pool_id, display_name, edit_token) on players to anon, authenticated;

drop policy if exists "public read pools" on pools;
create policy "public read pools" on pools for select using (true);

drop policy if exists "public read players" on players;
drop view if exists public_players;
create view public_players as
select id, pool_id, display_name, submitted_at, created_at
from players;
grant select on public_players to anon, authenticated;

drop policy if exists "public create players" on players;
create policy "public create players" on players for insert with check (true);

drop policy if exists "public read matches" on matches;
create policy "public read matches" on matches for select using (true);

drop policy if exists "public read picks" on picks;
create policy "public read picks" on picks for select using (true);

drop policy if exists "public create picks" on picks;
drop policy if exists "public update own open picks" on picks;

create or replace function save_pick(
  p_edit_token text,
  p_match_id uuid,
  p_picked_winner text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_locked boolean;
  v_submitted_at timestamptz;
begin
  select id, submitted_at into v_player_id, v_submitted_at
  from players
  where edit_token = p_edit_token;

  if v_player_id is null then
    raise exception 'Invalid edit link';
  end if;

  if v_submitted_at is not null then
    raise exception 'Your bracket is submitted and locked';
  end if;

  select starts_at is not null and starts_at <= now() into v_locked
  from matches
  where id = p_match_id;

  if coalesce(v_locked, false) then
    raise exception 'This match has already locked';
  end if;

  insert into picks (player_id, match_id, picked_winner, updated_at)
  values (v_player_id, p_match_id, p_picked_winner, now())
  on conflict (player_id, match_id)
  do update set picked_winner = excluded.picked_winner, updated_at = now();
end;
$$;

create or replace function get_player_by_token(
  p_pool_id uuid,
  p_edit_token text
) returns table (
  id uuid,
  pool_id uuid,
  display_name text,
  edit_token text,
  submitted_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select players.id, players.pool_id, players.display_name, players.edit_token, players.submitted_at, players.created_at
  from players
  where players.pool_id = p_pool_id
    and players.edit_token = p_edit_token;
$$;

create or replace function submit_bracket(
  p_edit_token text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_pick_count int;
begin
  select id into v_player_id
  from players
  where edit_token = p_edit_token;

  if v_player_id is null then
    raise exception 'Invalid edit link';
  end if;

  select count(*) into v_pick_count
  from picks
  where player_id = v_player_id;

  if v_pick_count < 31 then
    raise exception 'Pick every matchup before submitting';
  end if;

  update players
  set submitted_at = coalesce(submitted_at, now())
  where id = v_player_id;
end;
$$;

create or replace function set_match_winner(
  p_match_id uuid,
  p_winner text,
  p_admin_token text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_token text;
begin
  select pools.admin_token into expected_token
  from matches
  join pools on pools.id = matches.pool_id
  where matches.id = p_match_id;

  if expected_token is null or expected_token <> p_admin_token then
    raise exception 'Invalid admin code';
  end if;

  update matches
  set winner = nullif(p_winner, '')
  where id = p_match_id;
end;
$$;

insert into pools (name, slug, admin_token)
values ('World Cup Bracket', 'world-cup-bracket', 'CHANGE_THIS_ADMIN_CODE')
on conflict (slug) do nothing;

-- Round of 32 schedule source: SB Nation, published June 28, 2026.
-- Times are stored as Eastern time because the published fixture list labels all times as Eastern.
-- Later-round team names stay blank; each player's picks will fill those matchups in their bracket.
insert into matches (pool_id, round_name, round_index, slot, team_a, team_b, starts_at)
select pools.id, seed.round_name, seed.round_index, seed.slot, seed.team_a, seed.team_b, seed.starts_at::timestamptz
from pools
cross join (
  values
    ('Round of 32', 0, 1, '🇿🇦 South Africa', '🇨🇦 Canada', '2026-06-28 15:00:00-04'),
    ('Round of 32', 0, 2, '🇧🇷 Brazil', '🇯🇵 Japan', '2026-06-29 13:00:00-04'),
    ('Round of 32', 0, 3, '🇩🇪 Germany', '🇵🇾 Paraguay', '2026-06-29 16:30:00-04'),
    ('Round of 32', 0, 4, '🇳🇱 Netherlands', '🇲🇦 Morocco', '2026-06-29 21:00:00-04'),
    ('Round of 32', 0, 5, '🇨🇮 Ivory Coast', '🇳🇴 Norway', '2026-06-30 13:00:00-04'),
    ('Round of 32', 0, 6, '🇫🇷 France', '🇸🇪 Sweden', '2026-06-30 17:00:00-04'),
    ('Round of 32', 0, 7, '🇲🇽 Mexico', '🇪🇨 Ecuador', '2026-06-30 21:00:00-04'),
    ('Round of 32', 0, 8, '🏴 England', '🇨🇩 DR Congo', '2026-07-01 12:00:00-04'),
    ('Round of 32', 0, 9, '🇧🇪 Belgium', '🇸🇳 Senegal', '2026-07-01 16:00:00-04'),
    ('Round of 32', 0, 10, '🇺🇸 United States', '🇧🇦 Bosnia and Herzegovina', '2026-07-01 20:00:00-04'),
    ('Round of 32', 0, 11, '🇪🇸 Spain', '🇦🇹 Austria', '2026-07-02 15:00:00-04'),
    ('Round of 32', 0, 12, '🇵🇹 Portugal', '🇭🇷 Croatia', '2026-07-02 19:00:00-04'),
    ('Round of 32', 0, 13, '🇨🇭 Switzerland', '🇩🇿 Algeria', '2026-07-02 23:00:00-04'),
    ('Round of 32', 0, 14, '🇦🇺 Australia', '🇪🇬 Egypt', '2026-07-03 14:00:00-04'),
    ('Round of 32', 0, 15, '🇦🇷 Argentina', '🇨🇻 Cabo Verde', '2026-07-03 18:00:00-04'),
    ('Round of 32', 0, 16, '🇨🇴 Colombia', '🇬🇭 Ghana', '2026-07-03 21:30:00-04'),
    ('Round of 16', 1, 1, null, null, null),
    ('Round of 16', 1, 2, null, null, null),
    ('Round of 16', 1, 3, null, null, null),
    ('Round of 16', 1, 4, null, null, null),
    ('Round of 16', 1, 5, null, null, null),
    ('Round of 16', 1, 6, null, null, null),
    ('Round of 16', 1, 7, null, null, null),
    ('Round of 16', 1, 8, null, null, null),
    ('Quarterfinals', 2, 1, null, null, null),
    ('Quarterfinals', 2, 2, null, null, null),
    ('Quarterfinals', 2, 3, null, null, null),
    ('Quarterfinals', 2, 4, null, null, null),
    ('Semifinals', 3, 1, null, null, null),
    ('Semifinals', 3, 2, null, null, null),
    ('Final', 4, 1, null, null, null)
) as seed(round_name, round_index, slot, team_a, team_b, starts_at)
where pools.slug = 'world-cup-bracket'
on conflict (pool_id, round_index, slot) do nothing;
