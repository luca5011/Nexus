-- ============================================================
-- 티어 올클리어 보상(배경) 자동 지급 기능
-- Supabase SQL Editor에서 실행하세요. 기존 테이블/함수는 건드리지 않고
-- shop_items에 컬럼 하나 추가 + 새 함수 하나만 추가합니다.
-- ============================================================

-- shop_items에 "이 아이템은 몇 번 티어를 올클리어하면 자동 지급되는가" 컬럼 추가
-- null이면 기존처럼 코인으로 구매하는 일반 아이템
alter table shop_items add column if not exists unlock_tier_level int null;

-- 방금 정답을 맞힌 과목(p_subject) 기준으로, unlock_tier_level이 설정된 각 티어에 대해
-- "그 과목의 그 티어 문제를 전부 풀었는지" 확인하고, 처음 달성한 거면 자동 지급.
-- problem.html에서 정답 처리 직후(is_correct === true) 호출하세요.
create or replace function check_tier_clear_reward(p_subject text)
returns table(
  awarded boolean,
  item_id uuid,
  item_name text,
  tier_level int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reward record;
  v_total int;
  v_solved int;
  v_already_owned boolean;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- unlock_tier_level이 설정된 배경/테마 아이템들을 하나씩 확인
  for v_reward in
    select id, name, unlock_tier_level
    from shop_items
    where unlock_tier_level is not null
  loop
    -- 이 과목에서 해당 티어에 해당하는 문제가 실제로 있는지, 전부 있는지 확인
    select count(*) into v_total
      from problems
      where subject = p_subject and tier_level = v_reward.unlock_tier_level;

    if v_total = 0 then
      continue; -- 이 과목엔 해당 티어 문제가 없음 (스킵)
    end if;

    select count(*) into v_solved
      from solved_problems sp
      join problems pr on pr.id = sp.problem_id
      where sp.user_id = v_uid
        and pr.subject = p_subject
        and pr.tier_level = v_reward.unlock_tier_level;

    if v_solved < v_total then
      continue; -- 아직 올클리어 아님
    end if;

    -- 올클리어 완료. 이미 보유중인지 확인
    select exists(
      select 1 from user_inventory where user_id = v_uid and item_id = v_reward.id
    ) into v_already_owned;

    if v_already_owned then
      continue; -- 이미 받았음 (다른 과목에서 먼저 달성했을 수도 있음)
    end if;

    insert into user_inventory(user_id, item_id) values (v_uid, v_reward.id);

    return query select true, v_reward.id, v_reward.name, v_reward.unlock_tier_level;
    return; -- 한 번 호출에 하나만 지급 (여러 개 동시 달성 시 다음 제출에서 마저 지급됨)
  end loop;

  return query select false, null::uuid, null::text, null::int;
end;
$$;

grant execute on function check_tier_clear_reward(text) to authenticated;