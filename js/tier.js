// ============================================================
// 과목 & 티어 공통 정의
// ============================================================

const SUBJECTS = {
  coding:  { label: "코딩",  icon: "⌨", disabled: true },
  math:    { label: "수학",  icon: "∑", disabled: false },
  science: { label: "과학",  icon: "⚛", disabled: false },
  korean:  { label: "국어",  icon: "文", disabled: false },
};

const SUBJECT_ORDER = ["coding", "math", "science", "korean"];

// 6대 티어, 각 3단계(III -> II -> I 순으로 승급)
const TIER_NAMES = ["Origin", "Apex", "Zenith", "Infinity", "Transcendent", "Omniscient"];
const SUB_RANKS = ["III", "II", "I"];
// ★ 하드코딩 대신 DB(app_settings.rating_per_level)에서 동기화됨. 기본값은 동기화 전 임시값.
let RATING_PER_LEVEL = 80;
const MAX_TIER_LEVEL = TIER_NAMES.length * SUB_RANKS.length - 1; // 17

/** app_settings에서 실제 RATING_PER_LEVEL 값을 가져와 동기화 (nav.js의 renderNav에서 자동 호출됨) */
async function syncRatingPerLevel() {
  try {
    const { data, error } = await sb.from("app_settings").select("rating_per_level").eq("id", 1).single();
    if (!error && data?.rating_per_level) {
      RATING_PER_LEVEL = data.rating_per_level;
    }
  } catch (err) {
    console.error("티어 설정(RATING_PER_LEVEL) 동기화 실패, 기본값 사용:", err);
  }
}

// 티어 컬러 (Origin -> Omniscient 로 갈수록 화려해짐)
const TIER_COLORS = {
  Origin:       "#C97B4A", // ember copper
  Apex:         "#4A7BC9", // steel blue
  Zenith:       "#8B5FBF", // violet
  Infinity:     "#3FBFB0", // teal
  Transcendent: "#E8C547", // prism gold
  Omniscient:   "#2E3FAE", // 짙은 남색 — 모든 걸 초월한 최상위 티어
};

/** rating(숫자) -> 0~17 사이 티어 레벨 인덱스 */
function ratingToTierLevel(rating) {
  return Math.max(0, Math.min(MAX_TIER_LEVEL, Math.floor(rating / RATING_PER_LEVEL)));
}

/** 0~17 티어 레벨 -> {name, rank, color, label} */
function tierLevelToInfo(level) {
  const clamped = Math.max(0, Math.min(MAX_TIER_LEVEL, level));
  const name = TIER_NAMES[Math.floor(clamped / 3)];
  const rank = SUB_RANKS[clamped % 3];
  return {
    name,
    rank,
    label: `${name} ${rank}`,
    color: TIER_COLORS[name],
    level: clamped,
  };
}

/** rating -> 티어 정보 + 다음 승급까지 남은 레이팅 */
function ratingToTierDisplay(rating) {
  const level = ratingToTierLevel(rating);
  const info = tierLevelToInfo(level);
  const nextThreshold = (level + 1) * RATING_PER_LEVEL;
  const isMax = level === MAX_TIER_LEVEL;
  const remaining = isMax ? 0 : Math.max(0, nextThreshold - rating);
  const currentThreshold = level * RATING_PER_LEVEL;
  const progressPct = isMax
    ? 100
    : Math.min(100, Math.round(((rating - currentThreshold) / RATING_PER_LEVEL) * 100));
  return { ...info, rating, remaining, progressPct, isMax };
}

/** 배지 DOM 조각 생성 (nav/list/profile 공용) */
function renderTierBadge(rating, { size = "sm" } = {}) {
  const info = ratingToTierDisplay(rating);
  const el = document.createElement("span");
  el.className = `tier-badge tier-badge--${size}`;
  el.style.setProperty("--tier-color", info.color);
  el.innerHTML = `<span class="tier-badge__hex"></span><span class="tier-badge__label">${info.label}</span>`;
  el.title = `${info.label} · 레이팅 ${Math.round(info.rating)}`;
  return el;
}

/** 사용자 입력값을 innerHTML에 안전하게 넣기 위한 이스케이프 */
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}