/* =========================================================
   ANIME MAX ADMIN PANEL — Multi-Page Script
   Pages: index.html, anime-list.html, anime-title.html, profile.html
========================================================= */

"use strict";

import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* =========================================================
   FIREBASE CONFIG
========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyCpfrluxsBhnz48ve9RykIy1IxzbBfk7dA",
  authDomain: "sm-studio-7.firebaseapp.com",
  databaseURL: "https://sm-studio-7-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sm-studio-7",
  storageBucket: "sm-studio-7.firebasestorage.app",
  messagingSenderId: "126291501472",
  appId: "1:126291501472:web:a55c94b5b87581177204c5",
  measurementId: "G-Q1LVJRDPEF"
};

/* =========================================================
   PAGE STATE
========================================================= */
const CURRENT_PAGE = document.body.dataset.page || "dashboard";
const IS_DASHBOARD = CURRENT_PAGE === "dashboard";

const byId = id => document.getElementById(id);

let app = null, auth = null, database = null;
let currentAdmin = null;
let authListenerStarted = false;
let loginInProgress = false;
let notificationTimer = null;

const LANGUAGES = ["Hindi", "English", "Japanese", "Tamil", "Telugu", "Bengali", "Korean", "Chinese", "Other"];

/* =========================================================
   HELPERS
========================================================= */
function setText(id, value) { const el = byId(id); if (el) el.textContent = String(value); }

function showLoader(show = true) {
  const l = byId("pageLoader"); if (!l) return;
  l.hidden = !show;
  l.classList.toggle("hidden", !show);
  l.classList.toggle("is-hidden", !show);
  l.setAttribute("aria-hidden", String(!show));
}

function showNotification(msg, type = "success") {
  const box = byId("notificationMessage"); if (!box) return;
  clearTimeout(notificationTimer);
  box.textContent = msg;
  box.className = `notification-message ${type} show`;
  box.hidden = false;
  notificationTimer = setTimeout(() => {
    box.hidden = true;
    box.classList.remove("show");
  }, 4000);
}

function showLoginError(msg = "") {
  const err = byId("loginError");
  if (!err) { if (msg) console.error(msg); return; }
  err.textContent = msg;
  err.hidden = !msg;
}

function escapeHTML(v = "") {
  return String(v).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function safeURL(v) {
  if (!v) return "";
  try {
    const u = new URL(v);
    return ["https:", "http:"].includes(u.protocol) ? u.href : "";
  } catch { return ""; }
}

function formatDate(iso) { return iso ? new Date(iso).toLocaleString() : "—"; }

function firebaseErrorMessage(error) {
  const msgs = {
    "auth/invalid-email": "Email address sahi nahi hai.",
    "auth/invalid-credential": "Email ya password galat hai.",
    "auth/user-not-found": "Email ya password galat hai.",
    "auth/wrong-password": "Email ya password galat hai.",
    "auth/too-many-requests": "Bahut attempts. Baad mein try karo.",
    "auth/network-request-failed": "Internet check karo.",
    "auth/unauthorized-domain": "Firebase mein domain authorize nahi hai.",
    "auth/operation-not-allowed": "Email/Password login Firebase mein enable nahi hai.",
    "PERMISSION_DENIED": "Firebase Rules ne access rok diya.",
    "database/permission-denied": "Firebase Rules ne access rok diya."
  };
  return msgs[error?.code] || error?.message || "Kuch galat hua.";
}

/* =========================================================
   FIREBASE INIT
========================================================= */
function initializeFirebase() {
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    database = getDatabase(app);
    setText("firebaseStatus", "Connected");
    return true;
  } catch (e) {
    console.error("Firebase init failed:", e);
    setText("firebaseStatus", "Not connected");
    return false;
  }
}

/* =========================================================
   ADMIN VERIFICATION
========================================================= */
async function verifyAdminAccess(user) {
  if (!user || !database) throw new Error("Firebase auth unavailable.");

  const snap = await get(ref(database, `admins/${user.uid}`));

  if (!snap.exists()) {
    throw new Error("Access denied. Yeh UID database ke 'admins' folder mein nahi mila.");
  }

  const val = snap.val();
  const isAdmin = val === true || val?.role === "admin";

  if (!isAdmin) {
    throw new Error("Access denied. Database mein 'role: \"admin\"' hona chahiye.");
  }

  return true;
}

function updateAdminIdentity(user) {
  setText("sidebarAdminEmail", user.email || "Admin");
  setText("sidebarAdminName", user.displayName || user.email?.split("@")[0] || "Administrator");
  setText("authStatus", "Authenticated");
}

/* =========================================================
   PASSWORD VISIBILITY (only on index.html)
========================================================= */
const togglePassword = byId("togglePassword");
const adminPassword = byId("adminPassword");

if (togglePassword && adminPassword) {
  togglePassword.addEventListener("click", () => {
    const show = adminPassword.type === "password";
    adminPassword.type = show ? "text" : "password";
    togglePassword.setAttribute("aria-label", show ? "Hide password" : "Show password");
    const i = togglePassword.querySelector("i");
    if (i) { i.classList.toggle("fa-eye", !show); i.classList.toggle("fa-eye-slash", show); }
  });
}

/* =========================================================
   LOGIN FORM (only on index.html)
========================================================= */
const adminLoginForm = byId("adminLoginForm");

if (adminLoginForm) {
  adminLoginForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (loginInProgress) return;
    if (!auth || !database) { showLoginError("Firebase unavailable."); return; }

    const email = byId("adminEmail")?.value.trim() || "";
    const password = adminPassword?.value || "";
    const remember = byId("rememberAdmin")?.checked;

    if (!email || !password) { showLoginError("Email aur password enter karo."); return; }

    loginInProgress = true;
    showLoginError("");
    showLoader(true);

    const btn = byId("adminLoginButton");
    if (btn) { btn.disabled = true; btn.dataset.oldText = btn.textContent.trim(); btn.textContent = "Signing in..."; }

    try {
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await verifyAdminAccess(cred.user);
      currentAdmin = cred.user;
      updateAdminIdentity(currentAdmin);
      showNotification("Login successful.", "success");
      // onAuthStateChanged will handle UI
    } catch (error) {
      console.error(error);
      if (auth.currentUser) { try { await signOut(auth); } catch(e){} }
      currentAdmin = null;
      const custom = ["Access denied", "UID database", "role"];
      const isCustom = custom.some(m => error?.message?.includes(m));
      showLoginError(isCustom ? error.message : firebaseErrorMessage(error));
    } finally {
      loginInProgress = false;
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.oldText || "Sign In"; }
      showLoader(false);
    }
  });
}

/* =========================================================
   FORGOT PASSWORD
========================================================= */
byId("forgotPasswordButton")?.addEventListener("click", async () => {
  const email = byId("adminEmail")?.value.trim() || "";
  if (!email) { showLoginError("Pehle email enter karo."); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    showNotification("Reset email bhej diya gaya.", "success");
  } catch (e) {
    showNotification(firebaseErrorMessage(e), "error");
  }
});

/* =========================================================
   LOGOUT
========================================================= */
async function performLogout() {
  if (!auth || !currentAdmin) return;
  if (!confirm("Logout karna chahte hain?")) return;
  showLoader(true);
  try {
    await signOut(auth);
    currentAdmin = null;
    showNotification("Logout successful.", "success");
    setTimeout(() => { window.location.href = "index.html"; }, 500);
  } catch (e) {
    showNotification(firebaseErrorMessage(e), "error");
  } finally { showLoader(false); }
}

byId("profileLogoutButton")?.addEventListener("click", performLogout);

/* =========================================================
   AUTH STATE LISTENER (works on every page)
========================================================= */
function startAuthListener() {
  if (!auth || authListenerStarted) return;
  authListenerStarted = true;

  onAuthStateChanged(auth, async (user) => {
    showLoader(true);

    try {
      if (!user) {
        currentAdmin = null;

        // Non-dashboard pages → redirect to index
        if (!IS_DASHBOARD) {
          window.location.href = "index.html";
          return;
        }

        // Dashboard page → show login screen
        const login = byId("loginScreen");
        const admin = byId("adminApp");
        if (login) { login.hidden = false; login.style.display = ""; }
        if (admin) { admin.hidden = true; admin.style.display = "none"; }
        setText("authStatus", "Signed out");
        return;
      }

      await verifyAdminAccess(user);
      currentAdmin = user;
      updateAdminIdentity(user);

      // Hide login, show admin app
      const login = byId("loginScreen");
      const admin = byId("adminApp");
      if (login) { login.hidden = true; login.style.display = "none"; }
      if (admin) { admin.hidden = false; admin.style.display = ""; }

      // Render page-specific content
      await renderCurrentPage();

    } catch (error) {
      console.error("Auth verification failed:", error);
      currentAdmin = null;
      try { if (auth.currentUser) await signOut(auth); } catch(e){}

      // Non-dashboard pages → redirect
      if (!IS_DASHBOARD) {
        window.location.href = "index.html";
        return;
      }

      const login = byId("loginScreen");
      const admin = byId("adminApp");
      if (login) { login.hidden = false; login.style.display = ""; }
      if (admin) { admin.hidden = true; admin.style.display = "none"; }

      const custom = ["Access denied", "UID database", "role"];
      const isCustom = custom.some(m => error?.message?.includes(m));
      showLoginError(isCustom ? error.message : firebaseErrorMessage(error));

    } finally {
      showLoader(false);
    }
  }, error => {
    console.error(error);
    currentAdmin = null;
    if (!IS_DASHBOARD) { window.location.href = "index.html"; return; }
    showLoginError(firebaseErrorMessage(error));
    showLoader(false);
  });
}

/* =========================================================
   RENDER ROUTER
========================================================= */
async function renderCurrentPage() {
  if (CURRENT_PAGE === "dashboard") await renderDashboard();
  else if (CURRENT_PAGE === "anime-list") await renderAnimeList();
  else if (CURRENT_PAGE === "anime-title") await renderAnimeTitle();
  else if (CURRENT_PAGE === "profile") renderProfile();
}

/* =========================================================
   DASHBOARD
========================================================= */
async function renderDashboard() {
  try {
    const [a, m, e, u] = await Promise.all([
      countItems("animes"), countItems("movies"),
      countItems("episodes"), countItems("users")
    ]);
    setText("totalAnimeCount", a);
    setText("totalMoviesCount", m);
    setText("totalEpisodesCount", e);
    setText("totalUsersCount", u);
    await loadRecentContent();
  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

async function countItems(path) {
  const snap = await get(ref(database, path));
  if (!snap.exists()) return 0;
  const v = snap.val();
  return v && typeof v === "object" ? Object.keys(v).length : 0;
}

async function loadRecentContent() {
  const container = byId("recentContentList");
  if (!container) return;

  try {
    const [animesSnap, moviesSnap] = await Promise.all([
      get(ref(database, "animes")),
      get(ref(database, "movies"))
    ]);
    const animes = animesSnap.exists() ? animesSnap.val() : {};
    const movies = moviesSnap.exists() ? moviesSnap.val() : {};

    const items = [
      ...Object.entries(animes).map(([id, item]) => ({ id, ...item, _label: "Anime Series" })),
      ...Object.entries(movies).map(([id, item]) => ({ id, ...item, _label: "Anime Movie" }))
    ]
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
      .slice(0, 5);

    container.replaceChildren();

    if (!items.length) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa fa-folder-open-o" aria-hidden="true"></i>
          <h3>No content available</h3>
          <p>Anime series aur movies add karne ke baad yahan dikhenge.</p>
        </div>
      `;
      return;
    }

    items.forEach(item => {
      const row = document.createElement("div");
      row.className = "recent-content-item";
      row.style.cssText = "display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);gap:10px;";

      const t = document.createElement("strong");
      t.textContent = item.title || "Untitled";
      t.style.cssText = "font-size:13px;color:var(--text);";

      const c = document.createElement("span");
      c.textContent = item._label;
      c.style.cssText = "font-size:11px;color:var(--text-muted);flex-shrink:0;";

      row.append(t, c);
      container.appendChild(row);
    });
  } catch (err) {
    console.error("Recent content:", err);
  }
}

byId("refreshDashboardButton")?.addEventListener("click", async () => {
  showLoader(true);
  await renderDashboard();
  showLoader(false);
  showNotification("Refresh complete.", "success");
});

// Quick action buttons on dashboard
document.querySelectorAll("[data-action]").forEach(btn => {
  btn.addEventListener("click", () => {
    const a = btn.dataset.action;
    if (a === "add-movie" || a === "send-notification") {
      showNotification("Yeh feature abhi implement nahi hai.", "info");
    }
  });
});

/* =========================================================
   ANIME LIST PAGE
========================================================= */
async function renderAnimeList() {
  const grid = byId("animeListGrid");
  if (!grid) return;

  try {
    const snap = await get(ref(database, "animes"));
    const animes = snap.exists() ? snap.val() : {};
    const query = (byId("animeListSearch")?.value || "").trim().toLowerCase();

    const items = Object.entries(animes).filter(([id, item]) => {
      if (!item || typeof item !== "object") return false;
      const h = [id, item.title, item.genre, item.description].join(" ").toLowerCase();
      return h.includes(query);
    });

    grid.replaceChildren();

    if (!items.length) {
      const e = document.createElement("div");
      e.className = "management-empty";
      e.textContent = query ? "Koi anime nahi mila." : "Koi anime nahi hai. + button se add karein.";
      grid.appendChild(e);
      return;
    }

    items.forEach(([id, item]) => {
      const card = document.createElement("a");
      card.href = `anime-title.html?id=${encodeURIComponent(id)}`;
      card.className = "management-card";

      const img = safeURL(item.posterUrl || item.bannerUrl);
      if (img) {
        const im = document.createElement("img");
        im.src = img;
        im.alt = item.title || "";
        im.loading = "lazy";
        im.referrerPolicy = "no-referrer";
        im.addEventListener("error", () => im.remove());
        card.appendChild(im);
      }

      const body = document.createElement("div");
      body.className = "management-card-body";

      const t = document.createElement("h3");
      t.textContent = item.title || "Untitled";

      const d = document.createElement("p");
      d.textContent = `${item.releaseYear || "—"} · ${item.genre || "No genre"}`;

      const b = document.createElement("span");
      b.className = "management-badge";
      b.textContent = item.status || "Published";

      body.append(t, d, b);
      card.appendChild(body);
      grid.appendChild(card);
    });

    // Bind search only once
    const search = byId("animeListSearch");
    if (search && !search.dataset.bound) {
      search.dataset.bound = "1";
      search.addEventListener("input", renderAnimeList);
    }

  } catch (err) {
    console.error("Anime list error:", err);
    grid.innerHTML = `<div class="management-empty">Anime list load nahi ho saki.</div>`;
  }
}

byId("addAnimeButton")?.addEventListener("click", () => openContentForm("anime"));

// Auto-open form if ?add=1
if (new URLSearchParams(location.search).get("add") === "1") {
  setTimeout(() => openContentForm("anime"), 900);
}

/* =========================================================
   ANIME TITLE PAGE
========================================================= */
async function renderAnimeTitle() {
  const container = byId("animeTitleContent");
  if (!container) return;

  const animeId = new URLSearchParams(location.search).get("id");

  if (!animeId) {
    container.innerHTML = `
      <div class="page-heading">
        <div>
          <span class="section-label">CONTENT</span>
          <h1>Anime Title</h1>
          <p>Ek anime select karein.</p>
        </div>
      </div>
      <div class="content-card">
        <div class="empty-state">
          <i class="fa fa-television" aria-hidden="true"></i>
          <h3>Koi anime select nahi kiya</h3>
          <p>Anime List par jaakar kisi anime par tap karein.</p>
        </div>
        <a href="anime-list.html" class="management-button" style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:14px;text-decoration:none;">
          <i class="fa fa-list" aria-hidden="true"></i> Anime List Kholen
        </a>
      </div>
    `;
    return;
  }

  try {
    const snap = await get(ref(database, `animes/${animeId}`));
    if (!snap.exists()) {
      container.innerHTML = `<div class="management-empty">Anime nahi mila.</div>`;
      return;
    }

    const anime = snap.val();
    const img = safeURL(anime.bannerUrl || anime.posterUrl);

    const epsSnap = await get(ref(database, "episodes"));
    const allEps = epsSnap.exists() ? epsSnap.val() : {};
    const episodes = Object.entries(allEps)
      .filter(([, ep]) => ep && ep.animeId === animeId)
      .sort((a, b) => {
        const s = (a[1].seasonNumber || 1) - (b[1].seasonNumber || 1);
        return s !== 0 ? s : (a[1].episodeNumber || 0) - (b[1].episodeNumber || 0);
      });

    container.innerHTML = `
      <div class="title-hero" ${img ? `style="background-image:url('${img}')"` : ""}>
        <div class="title-hero-info">
          <h1>${escapeHTML(anime.title || "Untitled")}</h1>
          <p>${escapeHTML(anime.releaseYear || "")} ${anime.genre ? "· " + escapeHTML(anime.genre) : ""}</p>
        </div>
      </div>

      <div class="title-actions">
        <a href="anime-list.html" class="management-button secondary" style="text-decoration:none;display:flex;align-items:center;justify-content:center;gap:6px;">
          <i class="fa fa-arrow-left" aria-hidden="true"></i> Back
        </a>
        <button type="button" class="management-button" id="editThisAnime">
          <i class="fa fa-pencil" aria-hidden="true"></i> Edit
        </button>
        <button type="button" class="management-button danger" id="deleteThisAnime">
          <i class="fa fa-trash" aria-hidden="true"></i> Delete
        </button>
      </div>

      <div class="content-card">
        <div class="card-heading"><div><h2>Description</h2></div></div>
        <p style="color:var(--text-secondary);font-size:13px;line-height:1.7;">
          ${escapeHTML(anime.description || "Koi description nahi hai.")}
        </p>
      </div>

      <div class="content-card">
        <div class="card-heading">
          <div>
            <h2>Episodes (${episodes.length})</h2>
            <p>Is anime ke saare episodes.</p>
          </div>
          <button type="button" class="management-button" id="addEpisodeToAnime">
            <i class="fa fa-plus" aria-hidden="true"></i> Add
          </button>
        </div>
        <div id="episodesList"></div>
      </div>
    `;

    const epList = byId("episodesList");
    if (!episodes.length) {
      epList.innerHTML = `
        <div class="empty-state" style="min-height:120px;">
          <i class="fa fa-play-circle" aria-hidden="true"></i>
          <h3>Koi episode nahi</h3>
          <p>Add button se add karein.</p>
        </div>
      `;
    } else {
      episodes.forEach(([id, ep]) => {
        const row = document.createElement("div");
        row.className = "episode-row";

        const info = document.createElement("div");
        info.className = "episode-row-info";

        const t = document.createElement("strong");
        t.textContent = ep.title || "Untitled Episode";

        const m = document.createElement("span");
        m.textContent = `S${ep.seasonNumber || 1} · E${ep.episodeNumber || "—"} · ${ep.quality || "Auto"}`;

        info.append(t, m);

        const acts = document.createElement("div");
        acts.className = "episode-row-actions";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "management-button secondary";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", () => openContentForm("episodes", id, ep));

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "management-button danger";
        delBtn.textContent = "Del";
        delBtn.addEventListener("click", async () => {
          if (!confirm(`"${ep.title || "Episode"}" delete karein?`)) return;
          await remove(ref(database, `episodes/${id}`));
          showNotification("Episode delete ho gaya.", "success");
          renderAnimeTitle();
        });

        acts.append(editBtn, delBtn);
        row.append(info, acts);
        epList.appendChild(row);
      });
    }

    byId("editThisAnime")?.addEventListener("click", () => openContentForm("anime", animeId, anime));

    byId("deleteThisAnime")?.addEventListener("click", async () => {
      if (!confirm(`"${anime.title}" aur uske saare episodes delete karein?`)) return;
      showLoader(true);
      try {
        await remove(ref(database, `animes/${animeId}`));
        for (const [epId] of episodes) await remove(ref(database, `episodes/${epId}`));
        showNotification("Anime delete ho gaya.", "success");
        setTimeout(() => { window.location.href = "anime-list.html"; }, 500);
      } catch(e) {
        console.error(e);
        showNotification("Delete fail.", "error");
      } finally { showLoader(false); }
    });

    byId("addEpisodeToAnime")?.addEventListener("click", () => {
      openContentForm("episodes", null, { animeId });
    });

  } catch (e) {
    console.error("Anime title error:", e);
    container.innerHTML = `<div class="management-empty">Anime load nahi ho saka.</div>`;
  }
}

/* =========================================================
   PROFILE PAGE
========================================================= */
function renderProfile() {
  if (!currentAdmin) return;
  setText("profileName", currentAdmin.displayName || currentAdmin.email?.split("@")[0] || "Administrator");
  setText("profileEmail", currentAdmin.email || "—");
  setText("profileUid", currentAdmin.uid || "—");
  setText("profileVerified", currentAdmin.emailVerified ? "Yes ✓" : "No");
  setText("profileLastLogin", formatDate(currentAdmin.metadata?.lastSignInTime));
  setText("profileCreated", formatDate(currentAdmin.metadata?.creationTime));
}

/* =========================================================
   CONTENT FORM MODAL
========================================================= */
function openContentForm(pageName, id = null, item = {}) {
  if (!currentAdmin) return;
  closeModal();

  const isEpisode = pageName === "episodes";
  const collection = isEpisode ? "episodes" : "animes";
  const heading = id ? "Edit Content" : isEpisode ? "Add Episode" : "Add Anime Series";

  const backdrop = document.createElement("div");
  backdrop.id = "managementModalBackdrop";
  backdrop.className = "management-modal-backdrop";

  backdrop.innerHTML = `
    <section class="management-modal" role="dialog" aria-modal="true">
      <h2>${heading}</h2>
      <form id="contentForm">
        <div class="management-form-grid">

          ${isEpisode ? `
            <div class="management-field full">
              <label for="contentAnimeId">Anime Series *</label>
              <select id="contentAnimeId" required>
                <option value="">Loading anime...</option>
              </select>
            </div>
          ` : ""}

          <div class="management-field full">
            <label for="contentTitle">Title *</label>
            <input id="contentTitle" maxlength="180" required value="${escapeHTML(item.title || "")}" placeholder="${isEpisode ? "Episode title" : "Anime title"}">
          </div>

          ${isEpisode ? `
            <div class="management-field">
              <label for="contentSeason">Season *</label>
              <input id="contentSeason" type="number" min="1" required value="${Number(item.seasonNumber) || 1}">
            </div>
            <div class="management-field">
              <label for="contentEpisode">Episode *</label>
              <input id="contentEpisode" type="number" min="1" required value="${Number(item.episodeNumber) || 1}">
            </div>
          ` : `
            <div class="management-field">
              <label for="contentYear">Release Year</label>
              <input id="contentYear" type="number" min="1900" max="2200" value="${escapeHTML(item.releaseYear || "")}">
            </div>
            <div class="management-field">
              <label for="contentGenre">Genre</label>
              <input id="contentGenre" maxlength="120" value="${escapeHTML(item.genre || "")}" placeholder="Action, Adventure">
            </div>
          `}

          <div class="management-field full">
            <label for="contentDescription">Description</label>
            <textarea id="contentDescription" placeholder="Description">${escapeHTML(item.description || "")}</textarea>
          </div>

          <div class="management-field full">
            <label for="contentPoster">Poster Image URL</label>
            <input id="contentPoster" type="url" value="${escapeHTML(item.posterUrl || "")}" placeholder="https://...">
          </div>

          <div class="management-field full">
            <label for="contentBanner">Banner Image URL</label>
            <input id="contentBanner" type="url" value="${escapeHTML(item.bannerUrl || "")}" placeholder="https://...">
          </div>

          <div class="management-field full">
            <label for="contentVideo">${isEpisode ? "Video URL *" : "Trailer / Promo URL"}</label>
            <input id="contentVideo" type="url" ${isEpisode ? "required" : ""} value="${escapeHTML(item.videoUrl || "")}" placeholder="https://drive.google.com/...">
          </div>

          <div class="management-field">
            <label for="contentQuality">Quality</label>
            <select id="contentQuality">
              ${["Auto","360p","480p","720p","1080p","1440p","4K"].map(v => `<option ${item.quality === v ? "selected" : ""}>${v}</option>`).join("")}
            </select>
          </div>

          <div class="management-field">
            <label for="contentStatus">Status</label>
            <select id="contentStatus">
              ${["Published","Draft","Ongoing","Completed"].map(v => `<option ${item.status === v ? "selected" : ""}>${v}</option>`).join("")}
            </select>
          </div>

          ${isEpisode ? `
            <div class="management-field full">
              <label for="contentSubtitleUrl">Subtitle URL (.vtt)</label>
              <input id="contentSubtitleUrl" type="url" value="${escapeHTML(item.subtitleUrl || "")}" placeholder="https://.../sub.vtt">
            </div>
            <div class="management-field">
              <label for="contentSubtitleLanguage">Subtitle Language</label>
              <select id="contentSubtitleLanguage">
                ${LANGUAGES.map(l => `<option ${item.subtitleLanguage === l ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </div>
            <div class="management-field full">
              <label for="contentAudioUrl">Audio URL</label>
              <input id="contentAudioUrl" type="url" value="${escapeHTML(item.audioUrl || "")}" placeholder="https://.../audio.mp3">
            </div>
            <div class="management-field">
              <label for="contentAudioLanguage">Audio Language</label>
              <select id="contentAudioLanguage">
                ${LANGUAGES.map(l => `<option ${item.audioLanguage === l ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </div>
          ` : ""}
        </div>

        <div class="management-modal-actions">
          <button type="button" class="management-button secondary" id="cancelContentButton">Cancel</button>
          <button type="submit" class="management-button" id="saveContentButton">Save</button>
        </div>
      </form>
    </section>
  `;

  document.body.appendChild(backdrop);

  backdrop.addEventListener("click", e => { if (e.target === backdrop) closeModal(); });
  byId("cancelContentButton")?.addEventListener("click", closeModal);

  if (isEpisode) populateAnimeSelect(item.animeId || "");

  byId("contentForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    await saveContent(pageName, collection, id, item);
  });
}

async function populateAnimeSelect(selectedId) {
  const sel = byId("contentAnimeId"); if (!sel) return;

  try {
    const snap = await get(ref(database, "animes"));
    const animes = snap.exists() ? snap.val() : {};

    sel.replaceChildren();

    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Select Anime";
    sel.appendChild(opt);

    Object.entries(animes).forEach(([id, a]) => {
      if (!a) return;
      const o = document.createElement("option");
      o.value = id;
      o.textContent = a.title || id;
      o.selected = id === selectedId;
      sel.appendChild(o);
    });

    if (!Object.keys(animes).length) {
      opt.textContent = "Pehle Anime Series add karo";
    }
  } catch (err) {
    console.error(err);
    showNotification("Anime list load nahi ho saki.", "error");
  }
}

async function saveContent(pageName, collection, id, oldItem) {
  const btn = byId("saveContentButton");

  try {
    const title = byId("contentTitle")?.value.trim() || "";
    if (!title) throw new Error("Title required hai.");

    const isEpisode = pageName === "episodes";
    const video = byId("contentVideo")?.value.trim() || "";

    if (isEpisode && !safeURL(video)) {
      throw new Error("Valid video URL enter karo.");
    }

    const now = Date.now();
    const data = {
      ...oldItem,
      title,
      description: byId("contentDescription")?.value.trim() || "",
      posterUrl: byId("contentPoster")?.value.trim() || "",
      bannerUrl: byId("contentBanner")?.value.trim() || "",
      videoUrl: video,
      quality: byId("contentQuality")?.value || "Auto",
      status: byId("contentStatus")?.value || "Published",
      updatedAt: now,
      updatedBy: currentAdmin.uid
    };

    if (isEpisode) {
      data.animeId = byId("contentAnimeId")?.value || "";
      data.seasonNumber = Number(byId("contentSeason")?.value || 1);
      data.episodeNumber = Number(byId("contentEpisode")?.value || 1);
      data.subtitleUrl = byId("contentSubtitleUrl")?.value.trim() || "";
      data.subtitleLanguage = byId("contentSubtitleLanguage")?.value || "English";
      data.audioUrl = byId("contentAudioUrl")?.value.trim() || "";
      data.audioLanguage = byId("contentAudioLanguage")?.value || "Japanese";

      if (!data.animeId) throw new Error("Anime select karo.");
    } else {
      data.releaseYear = Number(byId("contentYear")?.value || 0) || null;
      data.genre = byId("contentGenre")?.value.trim() || "";
    }

    if (!oldItem.createdAt) {
      data.createdAt = now;
      data.createdBy = currentAdmin.uid;
    }

    if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }

    const docId = id || makeId();
    await set(ref(database, `${collection}/${docId}`), data);

    closeModal();
    showNotification(id ? "Update ho gaya." : "Save ho gaya.", "success");

    // Refresh current page
    if (CURRENT_PAGE === "anime-list") await renderAnimeList();
    else if (CURRENT_PAGE === "anime-title") await renderAnimeTitle();

  } catch (err) {
    console.error("Save error:", err);
    showNotification(firebaseErrorMessage(err), "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Save"; }
  }
}

function closeModal() {
  byId("managementModalBackdrop")?.remove();
}

/* =========================================================
   GLOBAL ERRORS
========================================================= */
window.addEventListener("error", e => console.error("App error:", e.error || e.message));
window.addEventListener("unhandledrejection", e => console.error("Unhandled:", e.reason));

/* =========================================================
   START
========================================================= */
async function start() {
  setText("currentYear", new Date().getFullYear());
  setText("dashboardYear", new Date().getFullYear());

  if (!initializeFirebase()) { showLoader(false); return; }
  startAuthListener();
}

start();
