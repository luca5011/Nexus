// 모든 페이지 상단에 <div id="nav-root"></div> 를 두고 이 스크립트를 불러오면
// 로그인 상태에 맞는 네비게이션 바를 그려줍니다.

async function renderNav(activePage) {
  const root = document.getElementById("nav-root");
  if (!root) return;

  // 페이지 렌더 전에 티어 설정(RATING_PER_LEVEL)부터 동기화 —
  // 이후 이 페이지에서 쓰이는 tierLevelToInfo/ratingToTierDisplay 등이 정확한 값을 쓰게 됨
  if (typeof syncRatingPerLevel === "function") {
    await syncRatingPerLevel();
  }

  let user = null;
  let profile = null;

  try {
    const { data } = await sb.auth.getUser();
    user = data.user;

    if (user) {
      const { data: p } = await sb
        .from("profiles")
        .select("username, coin_balance, is_admin, is_super_admin")
        .eq("id", user.id)
        .single();
      profile = p;
    }
  } catch (err) {
    console.error("renderNav: 로그인 상태 확인 실패", err);
  }

  const links = [
    { href: "problems.html", label: "문제", key: "problems" },
    { href: "problemsets.html", label: "문제집", key: "problemsets" },
    { href: "contests.html", label: "대회", key: "contests" },
    { href: "battles.html", label: "배틀", key: "battles" }, // 배틀 메뉴 추가
    { href: "ranking.html", label: "랭킹", key: "ranking" },
    { href: "show_tier_list.html", label: "티어 목록", key: "tiers" }, // 티어 메뉴 추가
    { href: "shop.html", label: "상점", key: "shop" },
    { href: "devnotes.html", label: "개발자노트", key: "devnotes" },
    { href: "submissions.html", label: "채점 기록", key: "submissions" },
  ];

  let rightHtml = "";
  if (user) {
    if (profile?.is_admin || profile?.is_super_admin) {
      links.push({ href: "admin.html", label: "관리자", key: "admin" });
    }
    if (profile?.is_super_admin) {
      links.push({ href: "superadmin.html", label: "총관리자", key: "superadmin" });
    }

    rightHtml = `
      <span class="coin-pill">🪙 ${profile?.coin_balance ?? 0}</span>
      <a href="profile.html">${profile?.username ?? "프로필"}</a>
      <button class="btn btn--ghost" id="logout-btn" style="padding:6px 12px;">로그아웃</button>
    `;
  } else {
    rightHtml = `
      <a href="login.html">로그인</a>
      <a class="btn btn--primary" href="signup.html" style="padding:8px 16px;">회원가입</a>
    `;
  }

  root.innerHTML = `
    <nav class="nav">
      <a class="nav__logo" href="index.html"><span class="dot">◆</span> Nexus</a>
      <div class="nav__links">
        ${links.map(l => `<a href="${l.href}" class="${activePage === l.key ? "active" : ""}">${l.label}</a>`).join("")}
      </div>
      <div class="nav__right">
        <a href="https://discord.gg/CBY9XKY4d" target="_blank" rel="noopener" class="btn btn--ghost" style="padding:6px 10px; background:#5865F2; border:none; color:#fff;" title="Discord">Discord</a>
        <button id="theme-toggle" class="btn btn--ghost" style="padding:6px 10px;" title="다크/라이트 모드 전환"></button>
        ${rightHtml}
      </div>
    </nav>
  `;

  const themeBtn = document.getElementById("theme-toggle");
  const applyThemeIcon = () => {
    themeBtn.textContent = document.documentElement.dataset.theme === "light" ? "🌙" : "☀️";
  };
  applyThemeIcon();
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("nexus-theme", next);
    applyThemeIcon();
  });

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await sb.auth.signOut();
      window.location.href = "index.html";
    });
  }
}

/** 로그인 안 되어 있으면 로그인 페이지로 튕겨내는 가드 (마이페이지/제출 등에서 사용) */
async function requireAuth() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    window.location.href = "login.html";
    return null;
  }
  return user;
}

/** 페이지 로드 시 저장된 테마 즉시 적용 (nav.js 로드 시점에 한 번 실행) */
document.documentElement.dataset.theme = localStorage.getItem("nexus-theme") || "dark";

/** 첫 접속이면 튜토리얼 모달을 한 번만 보여줌 */
function showTutorial() {
  const overlay = document.createElement("div");
  overlay.className = "tutorial-overlay";
  overlay.innerHTML = `
    <div class="tutorial-modal">
      <h2>Nexus에 오신 걸 환영해요 👋</h2>
      <ul class="tutorial-list">
        <li><strong>문제</strong>과목별(수학·과학·국어) 문제를 풀어요</li>
        <li><strong>랭킹</strong>과목별 레이팅 순위를 확인해요</li>
        <li><strong>상점</strong>코인으로 배경·테마·칭호를 구매해요</li>
        <li><strong>개발자노트</strong>업데이트 소식을 확인해요</li>
      </ul>
      <div class="tutorial-warning">저희는 AI 사용을 금지합니다.</div>
      <button class="btn btn--primary btn--block" id="tutorial-close">확인했어요</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById("tutorial-close").addEventListener("click", () => {
    localStorage.setItem("nexus-tutorial-seen", "true");
    overlay.remove();
  });
}

if (!localStorage.getItem("nexus-tutorial-seen")) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showTutorial);
  } else {
    showTutorial();
  }
}