// 모든 페이지 상단에 <div id="nav-root"></div> 를 두고 이 스크립트를 불러오면
// 로그인 상태에 맞는 네비게이션 바를 그려줍니다.

async function renderNav(activePage) {
  const root = document.getElementById("nav-root");
  if (!root) return;

  const { data: { user } } = await supabase.auth.getUser();

  const links = [
    { href: "problems.html", label: "문제", key: "problems" },
    { href: "ranking.html", label: "랭킹", key: "ranking" },
    { href: "shop.html", label: "상점", key: "shop" },
    { href: "devnotes.html", label: "개발자노트", key: "devnotes" },
  ];

  let rightHtml = "";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, coin_balance, is_admin")
      .eq("id", user.id)
      .single();

    if (profile?.is_admin) {
      links.push({ href: "admin.html", label: "관리자", key: "admin" });
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
      <a class="nav__logo" href="index.html"><span class="dot">◆</span> 멀티과목 OJ</a>
      <div class="nav__links">
        ${links.map(l => `<a href="${l.href}" class="${activePage === l.key ? "active" : ""}">${l.label}</a>`).join("")}
      </div>
      <div class="nav__right">${rightHtml}</div>
    </nav>
  `;

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.href = "index.html";
    });
  }
}

/** 로그인 안 되어 있으면 로그인 페이지로 튕겨내는 가드 (마이페이지/제출 등에서 사용) */
async function requireAuth() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = "login.html";
    return null;
  }
  return user;
}
