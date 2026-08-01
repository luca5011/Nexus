-- ============================================================
-- 배틀 매칭 중복 생성 방지: subject 단위 advisory lock 추가
-- Supabase SQL Editor에서 그대로 실행하면 기존 함수를 안전하게 교체합니다.
-- (테이블/정책은 건드리지 않고 join_battle_queue 함수만 재정의)
-- ============================================================

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

  -- ★ 추가: subject 단위로 매칭 로직 전체를 직렬화.
  -- 같은 과목에 동시에 여러 명이 몰려도 이 블록은 한 번에 하나씩만 실행됨.
  -- 트랜잭션 종료(커밋/롤백) 시 자동 해제되므로 별도 unlock 불필요.
  perform pg_advisory_xact_lock(hashtext('battle_queue_' || p_subject));

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
  -- (advisory lock으로 이미 직렬화됐지만, skip locked는 안전망으로 유지)
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