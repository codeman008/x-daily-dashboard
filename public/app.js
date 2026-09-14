// X 每日看板前端逻辑
const state = {
  categories: [],
  items: [],
  view: "home",
  cat: "all",
  q: "",
  fetchedAt: null,
  lang: localStorage.getItem("lang") || "zh",
  profiles: {},
};
const KEYWORDS = ["GPT", "Claude", "Gemini", "Grok", "Llama", "发布", "开源", "release", "launch", "agent", "AGI"];

const I18N = {
  zh: {
    title: "AI Signal Atlas", subtitle: "Tracking Intelligence in Motion", slogan: "洞察 X 上正在发生的智能变化。", search: "搜索账号或动态…", search_label: "探索",
    v_home: "知识图谱", v_board: "分类看板", v_timeline: "时间线", v_today: "今日", v_fav: "收藏", v_rank: "排行榜",
    home_hint: "17 分类 · 286 账号知识图谱", top100: "Top 100 影响力账号", graph_loading: "加载账号资料…",
    graph_hover: "悬停查看详情 · 点击访问推特",
    stat_categories: "个类别", stat_accounts: "总账号数", stat_followers: "总粉丝体量",
    auto: "自动刷新", manage: "管理账号", refresh: "刷新", loading: "加载中…",
    open: "打开 ↗", manage_title: "账号管理", add_cat: "+ 添加分类", cancel: "取消", save: "保存",
    accounts_unit: "个账号", updated: "更新于", count_unit: "条", refreshing: "刷新中",
    no_content: "没有内容。", no_today: "近 24 小时无更新。", no_fav: "还没有收藏。",
    first_fetch: (d, t) => `首次抓取中… ${d}/${t} 账号（免费额度限速，约需几分钟；升级 QPS 可秒刷）`,
    add_acc: "+ 添加账号", del: "删除", cat_id: "分类ID", cat_name: "分类名", handle_ph: "账号名(不带@)",
    name_ph: "显示名", desc_ph: "描述(可选)", saved: "已保存并重载", locale: "zh-CN",
    fullscreen: "全屏展示", followers: "粉丝", rank_title: "账号影响力排行", rank_hint: "按粉丝数排序",
    rank_loading: "正在获取账号资料…", rank_load: "加载排行榜（消耗额度）", rank_cached: "缓存于", rank_refresh: "↻ 按天刷新",
  },
  en: {
    title: "AI Signal Atlas", subtitle: "Tracking Intelligence in Motion", slogan: "Understand the intelligence shaping X.", search: "Search accounts or posts…", search_label: "Explore",
    v_home: "Graph", v_board: "Board", v_timeline: "Timeline", v_today: "Today", v_fav: "Saved", v_rank: "Ranking",
    home_hint: "Knowledge graph · 17 categories · 286 accounts", top100: "Top 100 by Influence",
    graph_loading: "Loading profiles…", graph_hover: "Hover for details · click to open X",
    stat_categories: "Categories", stat_accounts: "Total Accounts", stat_followers: "Total Followers",
    auto: "Auto", manage: "Accounts", refresh: "Refresh", loading: "Loading…",
    open: "Open ↗", manage_title: "Manage Accounts", add_cat: "+ Add category", cancel: "Cancel", save: "Save",
    accounts_unit: "accounts", updated: "Updated", count_unit: "posts", refreshing: "Refreshing",
    no_content: "No content. ", no_today: "Nothing in last 24h.", no_fav: "No saved posts yet.",
    first_fetch: (d, t) => `First fetch… ${d}/${t} accounts (free tier is rate-limited, ~minutes; upgrade QPS for instant)`,
    add_acc: "+ Add account", del: "Delete", cat_id: "Cat ID", cat_name: "Cat name", handle_ph: "handle (no @)",
    name_ph: "Display name", desc_ph: "Description (optional)", saved: "Saved & reloaded", locale: "en-US",
    fullscreen: "Fullscreen", v_rank: "Ranking", followers: "followers",
    rank_title: "Influence Ranking", rank_hint: "sorted by followers",
    rank_loading: "Fetching profiles…", rank_load: "Load ranking (uses credits)", rank_cached: "as of",
    rank_refresh: "↻ Refresh (daily)",
  },
};
const t = (k) => (I18N[state.lang][k] ?? k);

const store = {
  get read() { return new Set(JSON.parse(localStorage.getItem("read") || "[]")); },
  get fav() { return new Set(JSON.parse(localStorage.getItem("fav") || "[]")); },
  save(k, set) { localStorage.setItem(k, JSON.stringify([...set])); },
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const content = $("#content");

function applyI18n() {
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $("#langBtn").textContent = state.lang === "zh" ? "EN" : "中";
  updateSubtitle();
}

function updateSubtitle() {
  const total = state.categories.reduce((n, c) => n + c.accounts.length, 0);
  $("#subtitle").textContent = total + " " + t("accounts_unit") + " · " + state.categories.length + (state.lang === "zh" ? " 个领域" : " categories");
  const metric = $("#accountCount");
  if (metric) metric.textContent = total;
}

async function loadAccounts() {
  const res = await fetch("/api/accounts");
  const data = await res.json();
  state.categories = data.categories;
  renderCatFilter();
  updateSubtitle();
}

let pollTimer = null;
let profilesTimer = null;

async function loadFeed(force = false) {
  const btn = $("#refresh");
  btn.disabled = true;
  btn.textContent = t("refresh") + "…";
  try {
    const res = await fetch("/api/feed" + (force ? "?force=1" : ""));
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "error");
    state.items = data.items || [];
    state.fetchedAt = data.fetchedAt;
    render();

    if (data.refreshing) {
      const p = data.progress || {};
      updateRefreshStatus(p.done, p.total);
      clearTimeout(pollTimer);
      pollTimer = setTimeout(() => loadFeed(false), 4000);
    } else {
      clearTimeout(pollTimer);
      pollTimer = null;
      btn.disabled = false;
      btn.textContent = t("refresh");
      if (data.error && !state.items.length) {
        content.innerHTML = '<div class="empty error">' + esc(data.error) + "</div>";
      }
    }
  } catch (e) {
    clearTimeout(pollTimer);
    pollTimer = null;
    btn.disabled = false;
    btn.textContent = t("refresh");
    if (!state.items.length) {
      content.innerHTML = '<div class="empty error">' + esc(e.message) + "</div>";
    }
  }
}

function updateRefreshStatus(done, total) {
  const btn = $("#refresh");
  btn.disabled = true;
  btn.textContent = t("refreshing") + " " + (done || 0) + "/" + (total || 0);
  if (!state.items.length && content.querySelector(".empty")) {
    content.innerHTML = '<div class="empty">' + t("first_fetch")(done || 0, total || 0) + "</div>";
  }
}

function renderCatFilter() {
  const box = $("#catFilter");
  const mk = (id, name, color) => {
    const b = document.createElement("button");
    b.textContent = name;
    b.dataset.cat = id;
    if (id === state.cat) { b.classList.add("active"); if (color) b.style.background = color; }
    b.onclick = () => { state.cat = id; render(); renderCatFilter(); };
    return b;
  };
  box.innerHTML = "";
  box.appendChild(mk("all", state.lang === "zh" ? "全部" : "All"));
  state.categories.forEach((c) => box.appendChild(mk(c.id, c.name, c.color)));
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date(), diff = (now - d) / 1000;
  const zh = state.lang === "zh";
  if (diff < 60) return zh ? "刚刚" : "now";
  if (diff < 3600) return Math.floor(diff / 60) + (zh ? " 分钟前" : "m");
  if (diff < 86400) return Math.floor(diff / 3600) + (zh ? " 小时前" : "h");
  if (diff < 604800) return Math.floor(diff / 86400) + (zh ? " 天前" : "d");
  return d.toLocaleDateString(t("locale"), { month: "numeric", day: "numeric" });
}

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function highlight(text) {
  let html = esc(text);
  const terms = [...KEYWORDS];
  if (state.q) terms.unshift(state.q);
  terms.forEach((term) => {
    if (!term) return;
    const re = new RegExp("(" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    html = html.replace(re, "<mark>$1</mark>");
  });
  return html;
}

function filtered() {
  const q = state.q.toLowerCase();
  let list = state.items;
  if (state.cat !== "all") list = list.filter((i) => i.categoryId === state.cat);
  if (q) list = list.filter((i) => (i.text + i.name + i.handle).toLowerCase().includes(q));
  if (state.view === "today") {
    const cut = Date.now() - 86400000;
    list = list.filter((i) => i.date && new Date(i.date).getTime() >= cut);
  }
  if (state.view === "fav") { const f = store.fav; list = list.filter((i) => f.has(i.id)); }
  return list;
}

function setAvatar(img, item) {
  const initial = (item.name || item.handle || "?").trim().charAt(0).toUpperCase();
  const fallback = () => {
    img.classList.add("fallback");
    img.removeAttribute("src");
    img.textContent = initial;
    img.style.background = item.color || "#94a3b8";
  };
  // 优先用抓取返回的头像，否则用 unavatar.io 按 handle 解析
  const primary = item.avatar || ("https://unavatar.io/twitter/" + encodeURIComponent(item.handle));
  img.onerror = () => {
    if (img.dataset.tried !== "1" && item.avatar) {
      img.dataset.tried = "1";
      img.src = "https://unavatar.io/twitter/" + encodeURIComponent(item.handle);
    } else { fallback(); }
  };
  img.src = primary;
}

function makeCard(item) {
  const tpl = $("#cardTpl").content.cloneNode(true);
  const card = tpl.querySelector(".card");
  const read = store.read, fav = store.fav;
  if (!read.has(item.id)) card.classList.add("unread");

  setAvatar(tpl.querySelector(".avatar"), item);

  const author = tpl.querySelector(".author");
  author.textContent = item.name;
  author.href = "https://x.com/" + item.handle;
  tpl.querySelector(".handle").textContent = "@" + item.handle;

  const tm = tpl.querySelector(".time");
  tm.textContent = fmtTime(item.date);
  tm.title = item.date ? new Date(item.date).toLocaleString(t("locale")) : "";

  tpl.querySelector(".card-body").innerHTML = highlight(item.text || item.title || "");

  const tag = tpl.querySelector(".cat-tag");
  tag.textContent = item.categoryName;
  tag.style.background = item.color;

  const stats = tpl.querySelector(".stats");
  const parts = [];
  if (item.likes) parts.push("♥ " + fmtNum(item.likes));
  if (item.retweets) parts.push("🔁 " + fmtNum(item.retweets));
  if (item.replies) parts.push("💬 " + fmtNum(item.replies));
  stats.innerHTML = parts.map((p) => "<span>" + p + "</span>").join("");

  const open = tpl.querySelector(".open");
  open.textContent = t("open");
  open.href = item.link || ("https://x.com/" + item.handle);
  open.onclick = () => { const r = store.read; r.add(item.id); store.save("read", r); card.classList.remove("unread"); };

  const star = tpl.querySelector(".star");
  if (fav.has(item.id)) { star.classList.add("on"); star.textContent = "★"; }
  star.onclick = () => {
    const f = store.fav;
    if (f.has(item.id)) { f.delete(item.id); star.classList.remove("on"); star.textContent = "☆"; }
    else { f.add(item.id); star.classList.add("on"); star.textContent = "★"; }
    store.save("fav", f);
    if (state.view === "fav") render();
  };
  return tpl;
}

function fmtNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function renderBoard(list) {
  const board = document.createElement("div");
  board.className = "board";
  const profs = state.profiles || {};
  const cats = state.cat === "all" ? state.categories : state.categories.filter((c) => c.id === state.cat);
  cats.forEach((c) => {
    // 按粉丝排序的账号卡片（替代推文时间线）
    const accounts = [];
    c.accounts.forEach((a) => {
      const p = profs[a.handle.toLowerCase()];
      if (p && p.exists === false) return;  // 过滤无效账号
      accounts.push({
        handle: a.handle, name: a.name || a.handle, desc: (p && p.desc) || a.desc || "",
        followers: (p && p.followers) || 0, avatar: p && p.avatar, verified: p && p.verified,
        color: c.color, categoryName: c.name,
      });
    });
    accounts.sort((a, b) => b.followers - a.followers);  // 按粉丝数降序
    if (!accounts.length) return;

    const col = document.createElement("section");
    col.className = "column";
    const head = document.createElement("div");
    head.className = "col-head clickable";
    head.style.setProperty("--col-color", c.color);
    head.innerHTML = esc(c.name) + '<span class="count">' + accounts.length + "</span>";
    head.title = t("fullscreen");
    head.onclick = () => openModuleFull(c, accounts);
    const fs = document.createElement("button");
    fs.className = "fs-btn";
    fs.textContent = "⛶";
    fs.title = t("fullscreen");
    fs.onclick = (e) => { e.stopPropagation(); openModuleFull(c, accounts); };
    head.appendChild(fs);
    const body = document.createElement("div");
    body.className = "col-body account-grid";  // 改用 account-grid 样式（卡片网格）
    accounts.forEach((a) => body.appendChild(makeAccountCard(a)));
    col.appendChild(head); col.appendChild(body);
    board.appendChild(col);
  });
  return board;
}

function makeAccountCard(a) {
  const card = document.createElement("a");
  card.className = "account-card";
  card.href = "https://x.com/" + encodeURIComponent(a.handle);
  card.target = "_blank"; card.rel = "noopener";
  card.style.setProperty("--ac-color", a.color);
  const img = document.createElement("img");
  img.className = "avatar";
  setAvatar(img, a);
  const body = document.createElement("div");
  body.className = "ac-body";
  body.innerHTML =
    '<div class="ac-name">' + esc(a.name) + (a.verified ? '<span class="ac-badge" style="color:' + a.color + '">✔</span>' : '') + '</div>' +
    '<div class="ac-handle">@' + esc(a.handle) + '</div>' +
    '<div class="ac-desc">' + esc(a.desc) + '</div>' +
    '<div class="ac-fol" style="color:' + a.color + '">' + fmtNum(a.followers) + ' ' + t("followers") + '</div>';
  card.appendChild(img);
  card.appendChild(body);
  return card;
}

/* ---------- 单模块全屏展示（按账号田字格）---------- */
function openModuleFull(cat, rows) {
  $("#fsTitle").textContent = cat.name;
  const dot = document.querySelector(".fs-dot");
  dot.style.background = cat.color; dot.style.color = cat.color;
  const body = $("#fsBody");
  body.innerHTML = "";

  // 该分类下的全部账号，按 handle 归组推文（从 state.items 推文缓存取，不依赖传入 rows）
  const catDef = state.categories.find((c) => c.id === cat.id) || { accounts: [] };
  const byHandle = new Map();
  (state.items || []).forEach((r) => {
    if (r.categoryId && r.categoryId !== cat.id) return;
    const k = (r.handle || "").toLowerCase();
    if (!k) return;
    if (!byHandle.has(k)) byHandle.set(k, []);
    byHandle.get(k).push(r);
  });

  // 账号按粉丝数排序（有 profiles 数据时），无数据保持原顺序
  const accs = catDef.accounts.slice().sort((a, b) => {
    const fa = (state.profiles[a.handle.toLowerCase()] || {}).followers || 0;
    const fb = (state.profiles[b.handle.toLowerCase()] || {}).followers || 0;
    return fb - fa;
  });
  let accCount = 0;
  accs.forEach((acc) => {
    const posts = byHandle.get(acc.handle.toLowerCase()) || [];
    body.appendChild(makeAccountTile(acc, posts, cat.color));
    accCount++;
  });
  $("#fsCount").textContent = accCount + " " + t("accounts_unit");
  $("#fsOverlay").classList.remove("hidden");
  requestBrowserFullscreen();
}

function requestBrowserFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  }
}

function makeAccountTile(acc, posts, color) {
  const tile = document.createElement("div");
  tile.className = "acct-tile" + (posts.length ? "" : " empty");

  const head = document.createElement("div");
  head.className = "acct-head";
  const img = document.createElement("img");
  img.className = "avatar";
  setAvatar(img, { name: acc.name, handle: acc.handle, color, avatar: posts[0] && posts[0].avatar });
  const meta = document.createElement("div");
  meta.className = "acct-meta";
  meta.innerHTML = '<a class="acct-name" href="https://x.com/' + encodeURIComponent(acc.handle) +
    '" target="_blank" rel="noopener">' + esc(acc.name || acc.handle) + '</a>' +
    '<span class="acct-handle">@' + esc(acc.handle) + '</span>';
  head.appendChild(img); head.appendChild(meta);

  const list = document.createElement("div");
  list.className = "acct-posts";
  if (posts.length) {
    posts.forEach((p) => {
      const item = document.createElement("a");
      item.className = "acct-post";
      item.href = p.link || ("https://x.com/" + acc.handle);
      item.target = "_blank"; item.rel = "noopener";
      item.innerHTML = '<span class="acct-post-time">' + fmtTime(p.date) + '</span>' +
        '<span class="acct-post-text">' + highlight(p.text || p.title || "") + '</span>';
      list.appendChild(item);
    });
  } else {
    list.innerHTML = '<div class="acct-none">' + (state.lang === "zh" ? "暂无内容" : "No posts") + '</div>';
  }

  tile.appendChild(head); tile.appendChild(list);
  return tile;
}
function closeModuleFull() { $("#fsOverlay").classList.add("hidden"); }

function render() {
  stopGraph();  // 离开任何视图先停掉图谱动画
  if (state.view === "home") return renderHome();
  if (state.view === "rank") return renderRank();

  // 分类看板：账号卡片网格（按粉丝排序，依赖 profiles 而非推文）
  if (state.view === "board") {
    const profs = state.profiles || {};
    const total = state.categories.reduce((n, c) => n + c.accounts.length, 0);
    $("#meta").textContent = t("home_hint");
    content.innerHTML = "";
    if (!Object.keys(profs).length) {
      content.innerHTML = '<div class="empty">' + t("graph_loading") + '</div>';
      loadProfiles(true);
      return;
    }
    content.appendChild(renderBoard(null));
    return;
  }

  // 时间线 / 今日 / 收藏：推文流
  const list = filtered();
  $("#meta").textContent =
    (state.fetchedAt ? t("updated") + " " + new Date(state.fetchedAt).toLocaleTimeString(t("locale")) + " · " : "") +
    list.length + " " + t("count_unit");
  content.innerHTML = "";
  if (!list.length) {
    const extra = state.view === "today" ? t("no_today") : state.view === "fav" ? t("no_fav") : "";
    content.innerHTML = '<div class="empty">' + t("no_content") + extra + "</div>";
    return;
  }
  const stream = document.createElement("div");
  stream.className = "stream";
  list.forEach((i) => stream.appendChild(makeCard(i)));
  content.appendChild(stream);
}

/* ==================== 知识图谱主页 ==================== */
let graphAnim = null;      // requestAnimationFrame id
let graphState = null;     // { nodes, hubs, ... }

function stopGraph() {
  if (graphAnim) { cancelAnimationFrame(graphAnim); graphAnim = null; }
  graphState = null;
}

function renderHome() {
  $("#meta").textContent = t("home_hint");
  content.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "home-wrap";

  // 1) 知识图谱区（左侧 canvas + 右侧统计面板）
  const graphBox = document.createElement("div");
  graphBox.className = "graph-box";

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "graph-canvas-wrap";
  const canvas = document.createElement("canvas");
  canvas.id = "graphCanvas";
  const tip = document.createElement("div");
  tip.className = "graph-tip";
  tip.textContent = t("graph_hover");
  const tooltip = document.createElement("div");
  tooltip.className = "graph-tooltip hidden";
  tooltip.id = "graphTooltip";
  canvasWrap.appendChild(canvas);
  canvasWrap.appendChild(tip);
  canvasWrap.appendChild(tooltip);

  const statsPanel = document.createElement("div");
  statsPanel.className = "graph-stats";
  statsPanel.id = "graphStats";

  graphBox.appendChild(canvasWrap);
  graphBox.appendChild(statsPanel);
  wrap.appendChild(graphBox);

  // 2) Top100 卡片区
  const topSection = document.createElement("div");
  topSection.className = "top100";
  topSection.innerHTML = '<h2 class="top100-title">' + t("top100") + '</h2>';
  const grid = document.createElement("div");
  grid.className = "top100-grid";
  grid.id = "top100Grid";
  topSection.appendChild(grid);
  wrap.appendChild(topSection);

  content.appendChild(wrap);

  // 有资料就画，没有就先画（用账号列表）+ 触发按天加载
  buildGraph(canvas, tooltip);
  renderGraphStats(statsPanel);
  renderTop100(grid);
  if (!Object.keys(state.profiles).length) loadProfiles(true);
}

function renderGraphStats(panel) {
  const profs = state.profiles || {};
  const cats = state.categories;
  let totalAccs = 0, totalFols = 0, validAccs = 0;

  cats.forEach((c) => {
    c.accounts.forEach((a) => {
      totalAccs++;
      const p = profs[a.handle.toLowerCase()];
      if (p && p.exists === false) return;
      validAccs++;
      totalFols += (p && p.followers) || 0;
    });
  });

  const fmtBig = (n) => {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toString();
  };

  panel.innerHTML =
    '<div class="stat-item"><div class="stat-num">' + cats.length + '</div><div class="stat-label">' + t("stat_categories") + '</div></div>' +
    '<div class="stat-item"><div class="stat-num">' + validAccs + '</div><div class="stat-label">' + t("stat_accounts") + '</div></div>' +
    '<div class="stat-item"><div class="stat-num">' + fmtBig(totalFols) + '</div><div class="stat-label">' + t("stat_followers") + '</div></div>' +
    '<div class="stat-divider"></div>' +
    '<div class="stat-breakdown">' + cats.slice(0, 10).map((c) => {
      const count = c.accounts.filter((a) => {
        const p = profs[a.handle.toLowerCase()];
        return !(p && p.exists === false);
      }).length;
      return '<div class="stat-cat"><span class="stat-dot" style="background:' + c.color + '"></span>' +
        '<span class="stat-cat-name">' + esc(c.name.substring(0, 20)) + '</span>' +
        '<span class="stat-cat-count">' + count + '</span></div>';
    }).join('') + '</div>';
}

function renderTop100(grid) {
  const profs = state.profiles || {};
  const rows = [];
  state.categories.forEach((c) => {
    c.accounts.forEach((a) => {
      const p = profs[a.handle.toLowerCase()];
      if (p && p.exists === false) return;
      rows.push({
        handle: a.handle, name: a.name || a.handle, color: c.color, categoryName: c.name,
        followers: (p && p.followers) || 0, avatar: p && p.avatar,
        desc: (p && p.desc) || a.desc || "", verified: p && p.verified,
      });
    });
  });
  rows.sort((a, b) => b.followers - a.followers);
  const top = rows.slice(0, 100);
  grid.innerHTML = "";
  if (!top.some((r) => r.followers > 0)) {
    grid.innerHTML = '<div class="empty">' + t("graph_loading") + '</div>';
    return;
  }
  top.forEach((r, i) => grid.appendChild(makeTopCard(r, i + 1)));
}

function makeTopCard(r, rank) {
  const card = document.createElement("a");
  card.className = "top-card";
  card.href = "https://x.com/" + encodeURIComponent(r.handle);
  card.target = "_blank"; card.rel = "noopener";
  card.style.setProperty("--tc-color", r.color);
  const img = document.createElement("img");
  img.className = "avatar";
  setAvatar(img, { name: r.name, handle: r.handle, color: r.color, avatar: r.avatar });
  const body = document.createElement("div");
  body.className = "top-card-body";
  body.innerHTML =
    '<div class="top-card-head"><span class="top-rank">#' + rank + '</span>' +
    '<span class="top-name">' + esc(r.name) + '</span>' +
    (r.verified ? '<span class="rank-badge">✔</span>' : "") + '</div>' +
    '<div class="top-handle">@' + esc(r.handle) + '</div>' +
    '<div class="top-desc">' + esc(r.desc) + '</div>' +
    '<div class="top-foot"><span class="top-cat" style="background:' + r.color + '">' + esc(r.categoryName) + '</span>' +
    '<span class="top-fol">' + fmtNum(r.followers) + ' ' + t("followers") + '</span></div>';
  card.appendChild(img); card.appendChild(body);
  return card;
}

function hexA(hex, a) {
  // #rrggbb + alpha(0-1) -> rgba()
  const h = (hex || "#58a6ff").replace("#", "");
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return "rgba(" + r + "," + g + "," + b + "," + a + ")";
}

function buildGraph(canvas, tooltip) {
  const dpr = window.devicePixelRatio || 1;
  const box = canvas.parentElement.getBoundingClientRect();
  canvas.width = box.width * dpr; canvas.height = box.height * dpr;
  canvas.style.width = box.width + "px"; canvas.style.height = box.height + "px";
  const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
  const W = box.width, H = box.height, cx = W / 2, cy = H / 2;

  const profs = state.profiles || {};
  const cats = state.categories;
  const globeR = Math.min(W, H) * 0.28;  // 地球半径

  // 头像图片缓存（预加载）
  const avatarCache = new Map();
  const loadAvatar = (url, handle, color) => {
    if (!url || avatarCache.has(handle)) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => avatarCache.set(handle, img);
    img.onerror = () => avatarCache.set(handle, null);  // 加载失败标记 null
    img.src = url || `https://unavatar.io/twitter/${handle}`;
    avatarCache.set(handle, "loading");  // 占位
  };

  // 17 个分类按纬度带分层 + 经度随机分布
  const latBands = 6;  // 纬度分 6 层
  const nodes = [];
  cats.forEach((c, ci) => {
    const valid = c.accounts.filter((a) => { const p = profs[a.handle.toLowerCase()]; return !(p && p.exists === false); });
    const band = ci % latBands;
    const lat = (band / (latBands - 1)) * 140 - 70;  // -70° ~ +70°
    valid.forEach((a, i) => {
      const p = profs[a.handle.toLowerCase()];
      const fol = (p && p.followers) || 0;
      const lon = (i / valid.length) * 360 + (ci * 13) % 360;  // 经度散开
      const r = globeR * (1 + (Math.random() * 0.1 - 0.05));  // 轻微半径抖动
      const avatarUrl = p && p.avatar;
      loadAvatar(avatarUrl, a.handle, c.color);  // 预加载头像
      nodes.push({
        handle: a.handle, name: a.name || a.handle, color: c.color, categoryName: c.name,
        followers: fol, avatar: avatarUrl, verified: p && p.verified,
        desc: (p && p.desc) || a.desc || "", lat, lon, r,
        pulse: Math.random() * Math.PI * 2,
      });
    });
  });

  // 星空粒子 + 轨道环
  const stars = Array.from({ length: 100 }, () => ({
    x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.5 + 0.3,
    tw: Math.random() * Math.PI * 2, sp: 0.2 + Math.random() * 0.6,
  }));
  const orbits = [0.92, 1.15, 1.35];  // 3 条轨道环

  graphState = { nodes, cx, cy, W, H, globeR, rotY: 0, rotX: 0, t: 0 };

  // 球面坐标 → 3D 投影
  const project = (lat, lon, r, rotY, rotX) => {
    const latR = lat * Math.PI / 180, lonR = (lon + rotY) * Math.PI / 180;
    let x = r * Math.cos(latR) * Math.cos(lonR);
    let y = r * Math.sin(latR);
    let z = r * Math.cos(latR) * Math.sin(lonR);
    // 绕 X 轴微倾（增加立体感）
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    const y2 = y * cosX - z * sinX;
    z = y * sinX + z * cosX;
    y = y2;
    const scale = 1 / (1 + z / (r * 3));  // 透视
    return { x: cx + x * scale, y: cy + y * scale, z, scale };
  };

  let hover = null;
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    hover = null;
    for (const n of nodes) {
      const p = project(n.lat, n.lon, n.r, graphState.rotY, graphState.rotX);
      if (p.z < 0) continue;  // 背面
      const rr = Math.max(9, Math.min(26, 9 + Math.sqrt(n.followers) / 260)) * p.scale;
      if (Math.hypot(p.x - mx, p.y - my) < rr + 6) { hover = n; break; }
    }
    if (hover) {
      canvas.style.cursor = "pointer";
      tooltip.className = "graph-tooltip";
      tooltip.style.borderColor = hexA(hover.color, 0.7);
      tooltip.innerHTML =
        '<div class="tt-cat" style="color:' + hover.color + '">' + esc(hover.categoryName) + '</div>' +
        '<div class="tt-name">' + esc(hover.name) + (hover.verified ? ' <span style="color:' + hover.color + '">✔</span>' : '') + '</div>' +
        '<div class="tt-handle">@' + esc(hover.handle) + '</div>' +
        '<div class="tt-desc">' + esc(hover.desc) + '</div>' +
        '<div class="tt-fol" style="color:' + hover.color + '">' + fmtNum(hover.followers) + ' ' + t("followers") + '</div>';
      tooltip.style.left = Math.min(mx + 14, W - 230) + "px";
      tooltip.style.top = Math.min(my + 14, H - 140) + "px";
    } else {
      canvas.style.cursor = "default";
      tooltip.className = "graph-tooltip hidden";
    }
  };
  canvas.onmouseleave = () => { hover = null; tooltip.className = "graph-tooltip hidden"; };
  canvas.onclick = () => { if (hover) window.open("https://x.com/" + hover.handle, "_blank"); };

  function draw() {
    graphState.t += 0.016;
    graphState.rotY += 0.25;  // 地球自转速度
    graphState.rotX = 15 * Math.PI / 180;  // X 轴倾角
    const T = graphState.t;
    ctx.clearRect(0, 0, W, H);

    // 星空
    stars.forEach((s) => {
      const a = 0.25 + 0.6 * Math.abs(Math.sin(s.tw + T * s.sp));
      ctx.fillStyle = "rgba(180,200,240," + a + ")";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    });

    // 地球底座：轨道环（增加科技感）
    orbits.forEach((mult) => {
      ctx.strokeStyle = "rgba(88,166,255,0.12)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.ellipse(cx, cy + globeR * 0.2, globeR * mult, globeR * mult * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // 地球核心辉光
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, globeR * 0.7);
    coreGrad.addColorStop(0, "rgba(88,166,255,0.15)");
    coreGrad.addColorStop(1, "rgba(88,166,255,0)");
    ctx.fillStyle = coreGrad;
    ctx.beginPath(); ctx.arc(cx, cy, globeR * 0.7, 0, Math.PI * 2); ctx.fill();

    // 纬线网格（地球表面）
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.strokeStyle = "rgba(100,130,180,0.15)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let lon = 0; lon <= 360; lon += 6) {
        const p = project(lat, lon, globeR, graphState.rotY, graphState.rotX);
        if (p.z < 0) continue;
        if (lon === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // 经线网格
    for (let lon = 0; lon < 360; lon += 30) {
      ctx.strokeStyle = "rgba(100,130,180,0.15)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let lat = -80; lat <= 80; lat += 4) {
        const p = project(lat, lon, globeR, graphState.rotY, graphState.rotX);
        if (p.z < 0) continue;
        if (lat === -80) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // 节点按 Z 排序（后→前绘制，实现遮挡）
    const sorted = nodes.map((n) => {
      const p = project(n.lat, n.lon, n.r, graphState.rotY, graphState.rotX);
      return { n, p };
    }).filter((d) => d.p.z >= 0).sort((a, b) => a.p.z - b.p.z);

    // 账号节点（圆形头像图标 + 辉光光晕 + 脉动）
    sorted.forEach(({ n, p }) => {
      // 头像半径：粉丝越多越大，透视缩放
      const base = Math.max(9, Math.min(26, 9 + Math.sqrt(n.followers) / 260));
      const pulse = 1 + 0.06 * Math.sin(T * 2 + n.pulse);
      const r = base * pulse * p.scale;
      const hot = hover === n;

      // 光晕
      const glow = ctx.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, r * (hot ? 2.4 : 1.7));
      glow.addColorStop(0, hexA(n.color, hot ? 0.85 : 0.45));
      glow.addColorStop(1, hexA(n.color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * (hot ? 2.4 : 1.7), 0, Math.PI * 2); ctx.fill();

      const avatar = avatarCache.get(n.handle);
      if (avatar && avatar !== "loading" && avatar !== null) {
        // 画圆形头像
        ctx.save();
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
        ctx.drawImage(avatar, p.x - r, p.y - r, r * 2, r * 2);
        ctx.restore();
        // 彩色描边
        ctx.strokeStyle = hot ? "#fff" : hexA(n.color, 0.9);
        ctx.lineWidth = hot ? 3 : 1.8;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      } else {
        // 头像未就绪：回退到分类色圆点
        ctx.fillStyle = hot ? "#fff" : hexA(n.color, 0.95);
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.7, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = hexA(n.color, 0.9); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.7, 0, Math.PI * 2); ctx.stroke();
      }
    });

    // 分类统计标签（右下角图例）
    const legend = {};
    nodes.forEach((n) => { legend[n.categoryName] = (legend[n.categoryName] || 0) + 1; });
    const entries = Object.entries(legend).slice(0, 8);  // 只显示前 8 类避免拥挤
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "left";
    entries.forEach((e, i) => {
      const cat = cats.find((c) => c.name === e[0]);
      if (!cat) return;
      const lx = W - 160, ly = H - 130 + i * 16;
      ctx.fillStyle = cat.color;
      ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(200,210,230,0.8)";
      ctx.fillText(e[0].substring(0, 18) + " × " + e[1], lx + 10, ly + 4);
    });

    graphAnim = requestAnimationFrame(draw);
  }
  draw();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- 排行榜视图（按粉丝数，参考 topxup 但按分类着色 + 帖子数）---------- */
async function loadProfiles(force = false) {
  try {
    const res = await fetch("/api/profiles" + (force ? "?force=1" : ""));
    const data = await res.json();
    state.profiles = data.profiles || {};
    state.profilesAt = data.fetchedAt || null;
    if (data.refreshing) {
      updateProfilesStatus(data.progress);
      clearTimeout(profilesTimer);
      profilesTimer = setTimeout(() => loadProfiles(false), 3000);
    } else {
      clearTimeout(profilesTimer); profilesTimer = null;
      if (state.view === "rank" || state.view === "home" || state.view === "board") render();
    }
  } catch (e) { /* 静默，排行榜非核心 */ }
}

function updateProfilesStatus(p) {
  if (state.view !== "rank") return;
  const done = (p && p.done) || 0, total = (p && p.total) || 0;
  const el = $("#rankProgress");
  if (el) el.textContent = t("rank_loading") + " " + done + "/" + total;
}

function renderRank() {
  const profs = state.profiles || {};
  // 每个账号取 meta（含分类/颜色）+ profile（粉丝数）；清洗掉无效账号（exists=false）
  const rows = [];
  state.categories.forEach((c) => {
    c.accounts.forEach((a) => {
      const p = profs[a.handle.toLowerCase()];
      if (p && p.exists === false) return;   // 无效账号：不进排行榜
      rows.push({
        handle: a.handle, name: a.name || a.handle,
        color: c.color, categoryName: c.name,
        followers: (p && p.followers) || 0,
        avatar: p && p.avatar, desc: (p && p.desc) || a.desc || "",
        verified: p && p.verified, has: !!p,
      });
    });
  });
  const hasData = Object.keys(profs).length > 0;
  rows.sort((a, b) => b.followers - a.followers);

  const dateStr = state.profilesAt
    ? " · " + t("rank_cached") + " " + new Date(state.profilesAt).toLocaleDateString(t("locale"))
    : "";
  $("#meta").textContent = t("rank_hint") + " · " + rows.length + " " + t("accounts_unit") + dateStr;
  content.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "rank-wrap";
  if (!hasData) {
    // 无缓存资料：不自动抓取（省额度），给一个手动按钮
    const box = document.createElement("div");
    box.className = "empty";
    box.id = "rankProgress";
    const btn = document.createElement("button");
    btn.className = "refresh";
    btn.textContent = t("rank_load");
    btn.onclick = () => { btn.disabled = true; box.textContent = t("rank_loading"); loadProfiles(true); };
    box.appendChild(btn);
    wrap.appendChild(box);
    content.appendChild(wrap);
    return;
  }
  // 顶部工具条：手动“按天刷新”入口（点了才消耗额度）
  const bar = document.createElement("div");
  bar.className = "rank-bar";
  const btn = document.createElement("button");
  btn.className = "ghost";
  btn.textContent = t("rank_refresh");
  btn.onclick = () => {
    btn.disabled = true;
    btn.textContent = t("rank_loading");
    loadProfiles(true);
  };
  bar.appendChild(btn);
  wrap.appendChild(bar);

  rows.forEach((r, i) => wrap.appendChild(makeRankRow(r, i + 1)));
  content.appendChild(wrap);
}

function makeRankRow(r, rank) {
  const row = document.createElement("div");
  row.className = "rank-row";
  row.style.setProperty("--rk-color", r.color);
  const medal = rank <= 3 ? ["", "🥇", "🥈", "🥉"][rank] : rank;
  const img = document.createElement("img");
  img.className = "avatar";
  setAvatar(img, { name: r.name, handle: r.handle, color: r.color, avatar: r.avatar });
  const rankEl = document.createElement("span");
  rankEl.className = "rank-num" + (rank <= 3 ? " top" : "");
  rankEl.textContent = medal;
  const info = document.createElement("div");
  info.className = "rank-info";
  info.innerHTML =
    '<div class="rank-line1"><a class="rank-name" href="https://x.com/' + encodeURIComponent(r.handle) +
    '" target="_blank" rel="noopener">' + esc(r.name) + '</a>' +
    (r.verified ? '<span class="rank-badge">✔</span>' : "") +
    '<span class="rank-handle">@' + esc(r.handle) + '</span>' +
    '<span class="rank-cat" style="background:' + r.color + '">' + esc(r.categoryName) + '</span></div>' +
    '<div class="rank-desc">' + esc(r.desc) + '</div>';
  const fol = document.createElement("div");
  fol.className = "rank-followers";
  fol.innerHTML = '<b>' + fmtNum(r.followers) + '</b><span>' + t("followers") + '</span>';
  row.appendChild(rankEl); row.appendChild(img); row.appendChild(info); row.appendChild(fol);
  return row;
}

/* ---------- 账号管理编辑器 ---------- */
let editModel = null;

function openEditor() {
  editModel = JSON.parse(JSON.stringify(state.categories));
  renderEditor();
  $("#editorMsg").textContent = "";
  $("#editorMsg").className = "editor-msg";
  $("#editor").classList.remove("hidden");
}
function closeEditor() { $("#editor").classList.add("hidden"); }

function renderEditor() {
  const body = $("#editorBody");
  body.innerHTML = "";
  editModel.forEach((cat, ci) => body.appendChild(renderEditorCat(cat, ci)));
}

function renderEditorCat(cat, ci) {
  const box = document.createElement("div");
  box.className = "ed-cat";
  const head = document.createElement("div");
  head.className = "ed-cat-head";
  head.innerHTML =
    '<input type="text" class="ci-id" value="' + esc(cat.id) + '" placeholder="' + t("cat_id") + '">' +
    '<input type="text" class="ci-name" value="' + esc(cat.name) + '" placeholder="' + t("cat_name") + '">' +
    '<input type="color" class="ci-color" value="' + (cat.color || "#58a6ff") + '">' +
    '<span class="spacer"></span>' +
    '<button class="del" title="' + t("del") + '">🗑</button>';
  head.querySelector(".ci-id").oninput = (e) => { cat.id = e.target.value; };
  head.querySelector(".ci-name").oninput = (e) => { cat.name = e.target.value; };
  head.querySelector(".ci-color").oninput = (e) => { cat.color = e.target.value; };
  head.querySelector(".del").onclick = () => { editModel.splice(ci, 1); renderEditor(); };

  const accs = document.createElement("div");
  accs.className = "ed-accs";
  (cat.accounts || []).forEach((a, ai) => accs.appendChild(renderEditorAcc(cat, a, ai)));
  const addBtn = document.createElement("button");
  addBtn.className = "ghost ed-add-acc";
  addBtn.textContent = t("add_acc");
  addBtn.onclick = () => { cat.accounts.push({ handle: "", name: "", desc: "" }); renderEditor(); };
  accs.appendChild(addBtn);

  box.appendChild(head); box.appendChild(accs);
  return box;
}

function renderEditorAcc(cat, acc, ai) {
  const row = document.createElement("div");
  row.className = "ed-acc";
  row.innerHTML =
    '<input type="text" class="ai-handle" value="' + esc(acc.handle) + '" placeholder="' + t("handle_ph") + '">' +
    '<input type="text" class="ai-name" value="' + esc(acc.name || "") + '" placeholder="' + t("name_ph") + '">' +
    '<input type="text" class="ai-desc" value="' + esc(acc.desc || "") + '" placeholder="' + t("desc_ph") + '">' +
    '<button class="del" title="' + t("del") + '">✕</button>';
  row.querySelector(".ai-handle").oninput = (e) => { acc.handle = e.target.value; };
  row.querySelector(".ai-name").oninput = (e) => { acc.name = e.target.value; };
  row.querySelector(".ai-desc").oninput = (e) => { acc.desc = e.target.value; };
  row.querySelector(".del").onclick = () => { cat.accounts.splice(ai, 1); renderEditor(); };
  return row;
}

async function saveEditor() {
  const msg = $("#editorMsg");
  msg.textContent = "…"; msg.className = "editor-msg";
  try {
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories: editModel }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "error");
    state.categories = data.categories;
    renderCatFilter();
    updateSubtitle();
    msg.textContent = t("saved"); msg.className = "editor-msg ok";
    setTimeout(closeEditor, 700);
    loadFeed(true);
  } catch (e) {
    msg.textContent = e.message; msg.className = "editor-msg err";
  }
}

/* ---------- 初始化与事件 ---------- */
let autoTimer = null;
function initEvents() {
  $("#views").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.view = b.dataset.view;
    [...$("#views").children].forEach((x) => x.classList.toggle("active", x === b));
    render();
  };
  let searchT;
  $("#search").oninput = (e) => {
    clearTimeout(searchT);
    searchT = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 250);
  };
  $("#refresh").onclick = () => loadFeed(true);
  $("#langBtn").onclick = () => {
    state.lang = state.lang === "zh" ? "en" : "zh";
    localStorage.setItem("lang", state.lang);
    applyI18n();
    renderCatFilter();
    render();
  };
  $("#editBtn").onclick = openEditor;
  $("#editorClose").onclick = closeEditor;
  $("#editorCancel").onclick = closeEditor;
  $("#editorSave").onclick = saveEditor;
  $("#addCat").onclick = () => {
    editModel.push({ id: "cat" + (editModel.length + 1), name: "", color: "#58a6ff", accounts: [] });
    renderEditor();
  };
  $("#editor").onclick = (e) => { if (e.target.id === "editor") closeEditor(); };

  // 整页全屏（演示模式 + 浏览器全屏 API）
  $("#fsBtn").onclick = () => {
    document.body.classList.toggle("present");
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || (() => {})).call(document.documentElement);
    } else {
      (document.exitFullscreen || (() => {})).call(document);
    }
  };
  // 单模块全屏关闭
  $("#fsClose").onclick = closeModuleFull;
  // Esc 关闭覆盖层/演示模式
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !e.target.matches("input, textarea, select, [contenteditable]")) { e.preventDefault(); $("#search").focus(); return; }
    if (e.key !== "Escape") return;
    if (!$("#fsOverlay").classList.contains("hidden")) { closeModuleFull(); return; }
    if (!$("#editor").classList.contains("hidden")) { closeEditor(); return; }
    document.body.classList.remove("present");
  });
}

(async function init() {
  window.setTimeout(() => document.body.classList.add("loaded"), 950);
  initEvents();
  applyI18n();
  await loadAccounts();
  await loadFeed(false);
})();
