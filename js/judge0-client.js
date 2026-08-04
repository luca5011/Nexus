// ============================================================
// Judge0 채점 서버 설정
//
// 자체 호스팅한 Judge0 CE 인스턴스 주소, 또는 RapidAPI의 Judge0 CE
// 엔드포인트를 넣으세요. 호스팅 방식을 아직 안 정했으면 지금은 비워둬도
// 되고(코딩 문제 페이지에서 "채점 서버 설정이 안 됐어요" 메시지만 뜸),
// 나중에 이 파일만 채우면 바로 작동해요.
//
// - 자체 호스팅(docker-compose) 예시: JUDGE0_API_URL = "https://judge.내도메인.com"
//   (자체 호스팅이면 보통 JUDGE0_API_KEY / JUDGE0_API_HOST는 비워둬도 됨)
// - RapidAPI 사용 예시: JUDGE0_API_URL = "https://judge0-ce.p.rapidapi.com"
//   JUDGE0_API_KEY = "RapidAPI 키", JUDGE0_API_HOST = "judge0-ce.p.rapidapi.com"
// ============================================================
const JUDGE0_API_URL = "";  // 예: "https://judge0-ce.p.rapidapi.com" (끝에 슬래시 없이)
const JUDGE0_API_KEY = "";  // RapidAPI 등 키가 필요한 경우에만
const JUDGE0_API_HOST = ""; // RapidAPI 사용 시 X-RapidAPI-Host 값

// Judge0 CE 표준 language_id (자체 호스팅/RapidAPI 공통, 바뀌지 않는 값들)
const JUDGE0_LANGUAGES = {
  c:      { id: 50, label: "C (GCC 9.2.0)" },
  cpp:    { id: 54, label: "C++ (GCC 9.2.0)" },
  java:   { id: 62, label: "Java (OpenJDK 13.0.1)" },
  python: { id: 71, label: "Python 3 (3.8.1)" },
};

/** Judge0 채점 서버 주소가 설정됐는지 여부 */
function isJudge0Configured() {
  return Boolean(JUDGE0_API_URL);
}

/**
 * Judge0에 코드+입력을 보내고 실행 결과를 받아옴 (wait=true로 동기 대기).
 * @returns {stdout, stderr, compileOutput, statusId, statusDescription, time, memory}
 */
async function runOnJudge0(sourceCode, languageKey, stdin, limits = {}) {
  if (!isJudge0Configured()) {
    throw new Error("채점 서버(Judge0) 주소가 아직 설정되지 않았어요. js/judge0-client.js를 확인해주세요.");
  }

  const lang = JUDGE0_LANGUAGES[languageKey];
  if (!lang) throw new Error("지원하지 않는 언어예요: " + languageKey);

  const headers = { "Content-Type": "application/json" };
  if (JUDGE0_API_KEY) headers["X-RapidAPI-Key"] = JUDGE0_API_KEY;
  if (JUDGE0_API_HOST) headers["X-RapidAPI-Host"] = JUDGE0_API_HOST;

  const body = {
    source_code: sourceCode,
    language_id: lang.id,
    stdin: stdin ?? "",
  };
  if (limits.timeLimitMs) body.cpu_time_limit = limits.timeLimitMs / 1000;
  if (limits.memoryLimitKb) body.memory_limit = limits.memoryLimitKb;

  const res = await fetch(`${JUDGE0_API_URL}/submissions?base64_encoded=false&wait=true`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`채점 서버 요청 실패 (status ${res.status})`);
  }

  const data = await res.json();
  return {
    stdout: data.stdout ?? "",
    stderr: data.stderr ?? "",
    compileOutput: data.compile_output ?? "",
    statusId: data.status?.id,
    statusDescription: data.status?.description ?? "알 수 없음",
    time: data.time,
    memory: data.memory,
  };
}

/** Judge0 status id -> 한국어 라벨 */
function judge0StatusLabel(statusId) {
  const map = {
    1: "대기 중",
    2: "채점 중",
    3: "실행 완료",
    4: "출력 불일치",
    5: "시간 초과",
    6: "컴파일 에러",
    7: "런타임 에러 (SIGSEGV)",
    8: "런타임 에러 (SIGXFSZ)",
    9: "런타임 에러 (SIGFPE)",
    10: "런타임 에러 (SIGABRT)",
    11: "런타임 에러 (NZEC)",
    12: "런타임 에러",
    13: "채점 서버 내부 오류",
    14: "실행 형식 오류",
  };
  return map[statusId] ?? "알 수 없는 상태";
}
