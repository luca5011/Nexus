-- ============================================================
-- 전체 유저 채점 기록 공개 조회 기능
-- submissions 테이블은 그대로 두고, "정답 내용은 절대 반환하지 않는"
-- security definer 함수만 추가합니다. (배틀 기능 함수들과 동일한 패턴)
-- 클라이언트가 어떤 방식으로 요청하든 이 함수가 반환하는 컬럼 외에는
-- 절대 노출되지 않으므로 submitted_answer 유출 걱정이 없습니다.
-- ============================================================

create or replace function get_public_submissions(
  p_subject text default null,
  p_username text default null,
  p_limit int default 100
)
returns table(
  username text,
  subject text,
  problem_title text,
  is_correct boolean,
  submitted_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    pr.username,
    pm.subject,
    pm.title,
    s.is_correct,
    s.submitted_at
  from submissions s
  join problems pm on pm.id = s.problem_id
  join profiles pr on pr.id = s.user_id
  where (p_subject is null or pm.subject = p_subject)
    and (p_username is null or pr.username ilike p_username)
  order by s.submitted_at desc
  limit least(coalesce(p_limit, 100), 200);
$$;

grant execute on function get_public_submissions(text, text, int) to authenticated;