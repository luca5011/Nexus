// ============================================================
// Supabase 프로젝트 설정
// Supabase 대시보드 > Project Settings > API 에서 값을 복사해 채워넣으세요.
// ============================================================
const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_PUBLIC_KEY";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
