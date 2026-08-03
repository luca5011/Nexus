# Nexus

코딩(향후 개설)/수학/과학/국어 문제를 푸는 백준·정올 스타일 온라인 저지.
과목별 독립 티어(Origin~Omniscient, 각 III→II→I), Elo 기반 레이팅, 코인상점, 칭호 시스템 포함.

## 1. Supabase 프로젝트 준비

1. [supabase.com](https://supabase.com) 에서 새 프로젝트 생성
2. **SQL Editor** 에서 `sql/schema.sql` 내용을 그대로 실행
   - `profiles`, `user_tiers`, `problems`, `problem_choices`, `problem_answers`,
     `solved_problems`, `submissions`, `titles`, `user_titles`, `shop_items`,
     `user_inventory`, `dev_notes` 테이블과 RLS 정책, `submit_answer` / `purchase_item` /
     `purchase_title` 함수가 한 번에 생성됩니다.
3. **Authentication > Settings** 에서 이메일 인증(Confirm email)이 켜져 있는지 확인
4. **Project Settings > API** 에서 `Project URL` 과 `anon public` 키 복사

## 2. 프론트엔드 설정

`js/supabase-client.js` 를 열어 아래 두 값을 채워넣으세요.

```js
const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_PUBLIC_KEY";
```

## 3. 관리자 계정 지정하기

첫 관리자는 회원가입 후 Supabase 대시보드의 **Table Editor > profiles** 에서
본인 계정의 `is_admin` 값을 `true` 로 직접 바꿔주면 됩니다. 이후에는
관리자 페이지에서 문제 등록/칭호 관리/계정 밴을 할 수 있어요.

## 4. 로컬에서 확인하기

정적 파일이라 별도 빌드 없이 바로 열립니다. VS Code의 Live Server 확장이나

```bash
npx serve .
```

같은 명령으로 로컬 서버를 띄워서 확인하세요. (파일을 그냥 더블클릭해서 열면
CORS 문제로 Supabase 요청이 막힐 수 있어요.)

## 5. GitHub Pages 배포

`class-website` 때와 같은 방식으로 이 폴더를 GitHub 저장소에 올리고
Pages 를 켜면 됩니다.

## 파일 구조

```
multi-subject-oj/
├── index.html          홈 (로그인 시 과목별 티어 진행도)
├── login.html
├── signup.html
├── problems.html       과목별 문제 목록
├── problem.html         문제 풀이 (?id=문제ID)
├── ranking.html         과목별 랭킹
├── profile.html          내 프로필
├── shop.html             코인상점
├── devnotes.html         개발자노트
├── admin.html             관리자 (문제/칭호/노트/유저 관리)
├── css/style.css
├── js/
│   ├── supabase-client.js  ← URL/KEY 채워넣는 곳
│   ├── tier.js               티어/레이팅 계산 로직
│   └── nav.js                공용 네비게이션
└── sql/schema.sql            DB 스키마 + RLS + 서버 함수
```

## 핵심 로직 메모

- **정답 채점은 전부 서버(Postgres 함수 `submit_answer`)에서 처리**돼요.
  `problem_answers` 테이블은 RLS로 완전히 잠겨있어서 클라이언트가 직접
  정답을 조회할 수 없고, `security definer` 함수만 접근 가능해요.
- **레이팅 공식**: 문제를 정답 처리(최초 1회)할 때마다 `유저 레이팅 += (문제 티어 레벨 + 1)`. 예전엔 Elo 방식이었는데, 풀이 순서에 따라 최종 레이팅이 미세하게 달라지는 문제가 있어서 "푼 문제들의 티어 점수 합" 방식으로 바꿨어요. 오답이어도 레이팅은 깎이지 않아요(강등 없음).
- **티어 승급 폭**: `sql/schema.sql`의 `app_settings.rating_per_level` 값 (하드코딩 아님, 언제든 `update app_settings set rating_per_level = 원하는값 where id = 1;`로 조정 가능. 기본값 80)
- **티어 레벨 0~17**: `Origin III·II·I → Apex III·II·I → Zenith III·II·I → Infinity III·II·I → Transcendent III·II·I → Omniscient III·II·I`,
  레벨당 `app_settings.rating_per_level`만큼 (기본 80).
- **코인 지급**: 승급 시 +50, 본인 티어보다 3단계 이상 높은 문제 정답 시 +30
  (금액은 `sql/schema.sql` 의 `v_promo_coins`, `v_overtier_coins` 상수에서 조정 가능해요).
- **자동 칭호**: 티어 승급 칭호는 `titles.acquire_type='auto_tier'` 로 과목+티어레벨을
  미리 등록해둬야 자동 지급돼요(관리자 페이지에서 추가). 누적 풀이수 칭호(10/100/1000/3000/5000)는
  스키마에 기본으로 들어있어요.