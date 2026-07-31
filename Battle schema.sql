-- ============================================================
-- Nexus 배틀(1:1 실시간 대결) 기능용 스키마
-- Supabase SQL Editor에서 기존 schema.sql 실행 이후에 그대로 실행하세요.
-- 기존 테이블(profiles, problems, problem_choices, problem_answers 등)은
-- 전혀 건드리지 않고, 완전히 새로운 테이블/함수만 추가합니다.
-- ============================================================

-- 1) 과목별 배틀 레이팅 (기존 user_tiers와는 별개의 레이팅입니다)
create table if not exists battle_ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  rating numeric not null default 1000,
  wins int not null default 0,
  losses int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, subject)
);

alter table battle_ratings enable row level security;
drop policy if exists "battle_ratings_select_all" on battle_ratings;
create policy "battle_ratings_select_all" on battle_ratings for select using (true);

-- 2) 매칭 대기열
create table if not exists battle_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  subject text not null,
  rating numeric not null,
  created_at timestamptz not null default now()
);

alter table battle_queue enable row level security;
drop policy if exists "battle_queue_select_all" on battle_queue;
drop policy if exists "battle_queue_insert_own" on battle_queue;
drop policy if exists "battle_queue_update_own" on battle_queue;
drop policy if exists "battle_queue_delete_own" on battle_queue;
create policy "battle_queue_select_all" on battle_queue for select using (true);
create policy "battle_queue_insert_own" on battle_queue for insert with check (auth.uid() = user_id);
create policy "battle_queue_update_own" on battle_queue for update using (auth.uid() = user_id);
create policy "battle_queue_delete_own" on battle_queue for delete using (auth.uid() = user_id);

-- 3) 배틀 (대결 한 판)
create table if not exists battles (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  problem_id uuid not null references problems(id),
  player1_id uuid not null references auth.users(id),
  player2_id uuid not null references auth.users(id),
  status text not null default 'in_progress', -- in_progress | finished
  winner_id uuid,
  player1_correct boolean not null default false,
  player2_correct boolean not null default false,
  player1_answered_at timestamptz,
  player2_answered_at timestamptz,
  player1_rating_before numeric,
  player2_rating_before numeric,
  player1_rating_after numeric,
  player2_rating_after numeric,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table battles enable row level security;
drop policy if exists "battles_select_participant" on battles;
create policy "battles_select_participant" on battles
  for select using (auth.uid() = player1_id or auth.uid() = player2_id);

-- ============================================================
-- 함수들 (전부 security definer → RLS 우회해서 매칭/채점 처리)
-- ============================================================

-- 대기열 등록 + 즉시 매칭 시도. 매칭되면 battle_id를 반환하고,
-- 상대가 없으면 대기열에 넣고 빈 결과를 반환합니다.
-- 클라이언트에서 2~3초마다 반복 호출(polling)해서 매칭을 확인하세요.
create or replace function join_battle_queue(p_subject text)
returns table(battle_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rating numeric;
  v_opponent record;
  v_problem_id uuid;
  v_new_battle_id uuid;
  v_avg_tier int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  insert into battle_ratings(user_id, subject, rating)
    values (v_uid, p_subject, 1000)
    on conflict (user_id, subject) do nothing;

  select rating into v_rating from battle_ratings
    where user_id = v_uid and subject = p_subject;

  -- 이미 진행중인 배틀이 있으면 그걸 그대로 돌려준다 (새로고침 등으로 재호출된 경우)
  select id into v_new_battle_id from battles
    where status = 'in_progress' and (player1_id = v_uid or player2_id = v_uid)
    order by created_at desc limit 1;
  if v_new_battle_id is not null then
    return query select v_new_battle_id;
    return;
  end if;

  -- 상대 탐색: 같은 과목, 레이팅이 가장 가까운 사람
  select * into v_opponent from battle_queue
    where subject = p_subject and user_id <> v_uid
    order by abs(rating - v_rating) asc, created_at asc
    limit 1
    for update skip locked;

  if v_opponent is null then
    insert into battle_queue(user_id, subject, rating)
      values (v_uid, p_subject, v_rating)
      on conflict (user_id) do update
        set subject = excluded.subject, rating = excluded.rating, created_at = now();
    return; -- 아직 매칭 안됨 (빈 결과)
  end if;

  delete from battle_queue where user_id = v_opponent.user_id;
  delete from battle_queue where user_id = v_uid;

  -- 두 사람 평균 레이팅에 가까운 티어의 문제를 랜덤으로 하나 선택
  v_avg_tier := round((v_opponent.rating + v_rating) / 2 / 150);

  select id into v_problem_id from problems
    where subject = p_subject
    order by abs(tier_level - v_avg_tier) asc, random()
    limit 1;

  if v_problem_id is null then
    -- 해당 과목에 문제가 하나도 없으면 매칭 취소
    return;
  end if;

  insert into battles(subject, problem_id, player1_id, player2_id,
                       player1_rating_before, player2_rating_before)
    values (p_subject, v_problem_id, v_opponent.user_id, v_uid,
            v_opponent.rating, v_rating)
    returning id into v_new_battle_id;

  return query select v_new_battle_id;
end;
$$;

grant execute on function join_battle_queue(text) to authenticated;

-- 매칭 대기 취소
create or replace function leave_battle_queue()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from battle_queue where user_id = auth.uid();
end;
$$;

grant execute on function leave_battle_queue() to authenticated;

-- 정답을 맞혔을 때 호출. 이 배틀에서 "가장 먼저 맞힌 사람"이 승자가 됩니다.
-- 정답 채점 자체는 기존 submit_answer RPC를 클라이언트에서 먼저 호출해서
-- is_correct를 확인한 뒤, 맞았을 때만 이 함수를 호출하세요.
create or replace function record_battle_result(p_battle_id uuid)
returns table(
  battle_status text,
  winner_id uuid,
  is_winner boolean,
  my_rating_after numeric,
  my_rating_delta numeric,
  coins_awarded int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  b battles%rowtype;
  v_is_p1 boolean;
  v_opponent_id uuid;
  v_my_rating numeric;
  v_opp_rating numeric;
  v_expected numeric;
  v_delta numeric;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into b from battles where id = p_battle_id for update;
  if not found then
    raise exception 'BATTLE_NOT_FOUND';
  end if;
  if v_uid <> b.player1_id and v_uid <> b.player2_id then
    raise exception 'NOT_A_PARTICIPANT';
  end if;

  v_is_p1 := (v_uid = b.player1_id);
  v_opponent_id := case when v_is_p1 then b.player2_id else b.player1_id end;

  -- 이미 끝난 배틀이면 결과만 알려주고 종료
  if b.status = 'finished' then
    return query select b.status, b.winner_id, (b.winner_id = v_uid), null::numeric, null::numeric, 0;
    return;
  end if;

  if v_is_p1 then
    update battles set player1_correct = true, player1_answered_at = now() where id = p_battle_id;
  else
    update battles set player2_correct = true, player2_answered_at = now() where id = p_battle_id;
  end if;

  -- 첫 정답자 = 승자, 즉시 배틀 종료 + 레이팅 반영
  select rating into v_my_rating from battle_ratings where user_id = v_uid and subject = b.subject;
  select rating into v_opp_rating from battle_ratings where user_id = v_opponent_id and subject = b.subject;
  v_my_rating := coalesce(v_my_rating, 1000);
  v_opp_rating := coalesce(v_opp_rating, 1000);

  v_expected := 1.0 / (1.0 + power(10, (v_opp_rating - v_my_rating) / 400.0));
  v_delta := round(20 * (1 - v_expected));

  update battle_ratings set rating = rating + v_delta, wins = wins + 1, updated_at = now()
    where user_id = v_uid and subject = b.subject;
  update battle_ratings set rating = rating - v_delta, losses = losses + 1, updated_at = now()
    where user_id = v_opponent_id and subject = b.subject;

  update battles set
    status = 'finished',
    winner_id = v_uid,
    finished_at = now(),
    player1_rating_after = case when v_is_p1 then v_my_rating + v_delta else v_opp_rating - v_delta end,
    player2_rating_after = case when v_is_p1 then v_opp_rating - v_delta else v_my_rating + v_delta end
  where id = p_battle_id;

  update profiles set coin_balance = coin_balance + 30 where id = v_uid;

  return query select 'finished'::text, v_uid, true, (v_my_rating + v_delta), v_delta, 30;
end;
$$;

grant execute on function record_battle_result(uuid) to authenticated;
