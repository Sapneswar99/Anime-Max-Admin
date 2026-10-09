/* =========================================================
   ANIME MAX ADMIN PANEL
   Firebase Authentication + Realtime Database
   Anime Series / Movies / Episodes / Subtitles / Audio
   + Bottom Navigation
========================================================= */

"use strict";

/* =========================================================
   FIREBASE IMPORTS
========================================================= */

import {
  initializeApp,
  getApp,
  getApps
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

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
  update,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";


/* =========================================================
   FIREBASE CONFIGURATION
========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyCpfrluxsBhnz48ve9RykIy1IxzbBfk7dA",
  authDomain: "sm-studio-7.firebaseapp.com",
  databaseURL:
    "https://sm-studio-7-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sm-studio-7",
  storageBucket: "sm-studio-7.firebasestorage.app",
  messagingSenderId: "126291501472",
  appId: "1:126291501472:web:a55c94b5b87581177204c5",
  measurementId: "G-Q1LVJRDPEF"
};


/* =========================================================
   STATE
========================================================= */

let app = null;
let auth = null;
let database = null;
let currentAdmin = null;
let authListenerStarted = false;
let loginInProgress = false;
let notificationTimer = null;
let currentPage = "dashboard";
let editingId = null;
let editingCollection = null;
let contentCache = {
  animes: {},
  movies: {},
  episodes: {}
};

const byId = id => document.getElementById(id);

const COLLECTIONS = {
  anime: "animes",
  movies: "movies",
  episodes: "episodes"
};

const LANGUAGES = [
  "Hindi", "English", "Japanese", "Tamil",
  "Telugu", "Bengali", "Korean", "Chinese", "Other"
];


/* =========================================================
   FIREBASE INITIALIZATION
========================================================= */

function initializeFirebase() {
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    database = getDatabase(app);

    setText("firebaseStatus", "Connected");
    return true;
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    setText("firebaseStatus", "Not connected");
    showLoginError("Firebase initialization failed. Check the configuration.");
    return false;
  }
}


/* =========================================================
   UI HELPERS
========================================================= */

function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = String(value);
}

function showLoader(show = true) {
  const loader = byId("pageLoader");
  if (!loader) return;

  loader.hidden = !show;
  loader.classList.toggle("hidden", !show);
  loader.classList.toggle("is-hidden", !show);
  loader.setAttribute("aria-hidden", String(!show));
}

function showLoginScreen() {
  const login = byId("loginScreen");
  const admin = byId("adminApp");

  if (login) {
    login.hidden = false;
    login.style.display = "";
    login.setAttribute("aria-hidden", "false");
  }

  if (admin) {
    admin.hidden = true;
    admin.style.display = "none";
    admin.setAttribute("aria-hidden", "true");
  }
}

function showAdminDashboard() {
  const login = byId("loginScreen");
  const admin = byId("adminApp");

  if (login) {
    login.hidden = true;
    login.style.display = "none";
    login.setAttribute("aria-hidden", "true");
  }

  if (admin) {
    admin.hidden = false;
    admin.style.display = "";
    admin.setAttribute("aria-hidden", "false");
  }
}

function showLoginError(message = "") {
  const error = byId("loginError");

  if (!error) {
    if (message) console.error(message);
    return;
  }

  error.textContent = message;
  error.hidden = !message;
}

function showNotification(message, type = "success") {
  const box = byId("notificationMessage");

  if (!box) {
    console.log(`[${type}] ${message}`);
    return;
  }

  clearTimeout(notificationTimer);

  box.textContent = message;
  box.className = `notification-message ${type} show`;
  box.hidden = false;

  notificationTimer = setTimeout(() => {
    box.hidden = true;
    box.classList.remove("show");
  }, 4000);
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function makeId() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

function formatPageName(name = "") {
  return name
    .replace(/-/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function firebaseErrorMessage(error) {
  const messages = {
    "auth/invalid-email": "Email address sahi nahi hai.",
    "auth/invalid-credential": "Email ya password galat hai.",
    "auth/user-not-found": "Email ya password galat hai.",
    "auth/wrong-password": "Email ya password galat hai.",
    "auth/too-many-requests": "Bahut attempts hue. Baad mein try karo.",
    "auth/network-request-failed": "Internet connection check karo.",
    "auth/unauthorized-domain": "Firebase mein website domain authorize nahi hai.",
    "auth/operation-not-allowed": "Firebase Email/Password login enable nahi hai.",
    "PERMISSION_DENIED": "Firebase Rules ne database access rok diya.",
    "database/permission-denied": "Firebase Rules ne database access rok diya."
  };

  return messages[error?.code] ||
    error?.message ||
    "Kuch galat hua. Dobara try karo.";
}

function initializeUI() {
  const year = new Date().getFullYear();

  setText("currentYear", year);
  setText("dashboardYear", year);

  showLoginScreen();
}


/* =========================================================
   SECURE ADMIN CHECK (100% Fixed for role:"admin" & true)
========================================================= */

async function verifyAdminAccess(user) {
  if (!user || !database) {
    throw new Error("Firebase authentication unavailable.");
  }

  const snapshot = await get(
    ref(database, `admins/${user.uid}`)
  );

  if (!snapshot.exists()) {
    throw new Error("Access denied. Yeh UID database ke 'admins' folder mein nahi mila.");
  }

  const value = snapshot.val();
  const isAdmin = value === true || value?.role === "admin";

  if (!isAdmin) {
    throw new Error("Access denied. Database mein role galat hai (role: 'admin' hona chahiye).");
  }

  return true;
}

function updateAdminIdentity(user) {
  setText(
    "sidebarAdminEmail",
    user.email || "Admin"
  );

  setText(
    "sidebarAdminName",
    user.displayName ||
      user.email?.split("@")[0] ||
      "Administrator"
  );

  setText("authStatus", "Authenticated");
}


/* =========================================================
   PASSWORD VISIBILITY
========================================================= */

const togglePassword = byId("togglePassword");
const adminPassword = byId("adminPassword");

if (togglePassword && adminPassword) {
  togglePassword.addEventListener("click", () => {
    const show = adminPassword.type === "password";

    adminPassword.type = show ? "text" : "password";

    togglePassword.setAttribute(
      "aria-label",
      show ? "Hide password" : "Show password"
    );

    togglePassword.setAttribute(
      "aria-pressed",
      String(show)
    );

    const icon = togglePassword.querySelector("i");

    if (icon) {
      icon.classList.toggle("fa-eye", !show);
      icon.classList.toggle("fa-eye-slash", show);
    }
  });
}


/* =========================================================
   LOGIN
========================================================= */

const adminLoginForm = byId("adminLoginForm");

if (adminLoginForm) {
  adminLoginForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (loginInProgress) return;

    if (!auth || !database) {
      showLoginError("Firebase unavailable. Page refresh karo.");
      return;
    }

    const email = byId("adminEmail")?.value.trim() || "";
    const password = adminPassword?.value || "";
    const remember = byId("rememberAdmin")?.checked;

    if (!email || !password) {
      showLoginError("Email aur password enter karo.");
      return;
    }

    loginInProgress = true;
    showLoginError("");
    showLoader(true);

    const button = byId("adminLoginButton");

    if (button) {
      button.disabled = true;
      button.dataset.oldText ||= button.textContent.trim();
      button.textContent = "Signing in...";
    }

    try {
      await setPersistence(
        auth,
        remember
          ? browserLocalPersistence
          : browserSessionPersistence
      );

      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      await verifyAdminAccess(credential.user);

      currentAdmin = credential.user;
      updateAdminIdentity(currentAdmin);
      showAdminDashboard();

      await loadDashboardStatistics();

      showNotification("Admin login successful.", "success");

    } catch (error) {
      console.error("Login error:", error);

      if (auth.currentUser) {
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error(signOutError);
        }
      }

      currentAdmin = null;
      showLoginScreen();
      
      // Show exact error message
      const customMessages = ["Access denied", "UID database", "role galat"];
      const isCustom = customMessages.some(msg => error?.message?.includes(msg));
      showLoginError(isCustom ? error.message : firebaseErrorMessage(error));

    } finally {
      loginInProgress = false;

      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.oldText || "Sign In";
      }

      showLoader(false);
    }
  });
}


/* =========================================================
   PASSWORD RESET
========================================================= */

const forgotPasswordButton = byId("forgotPasswordButton");

if (forgotPasswordButton) {
  forgotPasswordButton.addEventListener("click", async () => {
    const email = byId("adminEmail")?.value.trim() || "";

    if (!auth) {
      showNotification("Firebase Auth unavailable.", "error");
      return;
    }

    if (!email) {
      showLoginError("Pehle email address enter karo.");
      byId("adminEmail")?.focus();
      return;
    }

    showLoader(true);

    try {
      await sendPasswordResetEmail(auth, email);
      showNotification("Password reset email bhej diya gaya.", "success");
    } catch (error) {
      showNotification(firebaseErrorMessage(error), "error");
    } finally {
      showLoader(false);
    }
  });
}


/* =========================================================
   LOGOUT
========================================================= */

const logoutButton = byId("logoutButton");

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    if (!auth || !currentAdmin) return;

    if (!confirm("Kya aap logout karna chahte hain?")) return;

    showLoader(true);

    try {
      await signOut(auth);

      currentAdmin = null;
      showLoginScreen();

      showNotification("Logout successful.", "success");

    } catch (error) {
      showNotification(firebaseErrorMessage(error), "error");
    } finally {
      showLoader(false);
    }
  });
}


/* =========================================================
   AUTH STATE LISTENER
========================================================= */

function startAuthListener() {
  if (!auth || authListenerStarted) return;

  authListenerStarted = true;

  onAuthStateChanged(auth, async user => {
    showLoader(true);

    try {
      if (!user) {
        currentAdmin = null;
        showLoginScreen();
        setText("authStatus", "Signed out");
        return;
      }

      await verifyAdminAccess(user);

      currentAdmin = user;
      updateAdminIdentity(user);
      showAdminDashboard();

      await loadDashboardStatistics();

    } catch (error) {
      console.error("Authentication verification failed:", error);

      currentAdmin = null;
      showLoginScreen();
      setText("authStatus", "Verification failed");

      try {
        if (auth.currentUser) await signOut(auth);
      } catch (signOutError) {
        console.error(signOutError);
      }

      const customMessages = ["Access denied", "UID database", "role galat"];
      const isCustom = customMessages.some(msg => error?.message?.includes(msg));
      showLoginError(isCustom ? error.message : firebaseErrorMessage(error));

    } finally {
      showLoader(false);
    }
  }, error => {
    console.error(error);
    currentAdmin = null;
    showLoginScreen();
    showLoginError(firebaseErrorMessage(error));
    showLoader(false);
  });
}


/* =========================================================
   DATABASE HELPERS
========================================================= */

function requireAdmin() {
  if (!currentAdmin || !database) {
    throw new Error("Admin session nahi hai. Dobara login karo.");
  }
}

async function readCollection(collection) {
  requireAdmin();

  if (!Object.values(COLLECTIONS).includes(collection)) {
    throw new Error("Invalid content collection.");
  }

  const snapshot = await get(ref(database, collection));

  const value = snapshot.exists() ? snapshot.val() : {};

  if (!value || typeof value !== "object") return {};

  return value;
}

function countItems(value) {
  if (!value || typeof value !== "object") return 0;

  return Object.values(value).filter(
    item => item !== null && item !== undefined
  ).length;
}

async function countDatabaseItems(path) {
  requireAdmin();

  const snapshot = await get(ref(database, path));

  return snapshot.exists()
    ? countItems(snapshot.val())
    : 0;
}

async function loadDashboardStatistics() {
  if (!currentAdmin || !database) return;

  const refreshButton = byId("refreshDashboardButton");

  if (refreshButton) refreshButton.disabled = true;

  try {
    const paths = ["animes", "movies", "episodes", "users"];
    const ids = ["totalAnimeCount", "totalMoviesCount", "totalEpisodesCount", "totalUsersCount"];

    const results = await Promise.allSettled(
      paths.map(path => countDatabaseItems(path))
    );

    results.forEach((result, index) => {
      setText(
        ids[index],
        result.status === "fulfilled"
          ? result.value
          : "—"
      );

      if (result.status === "rejected") {
        console.error(paths[index], result.reason);
      }
    });

    await loadRecentContent();

  } catch (error) {
    console.error(error);
    showNotification("Dashboard data load nahi ho saka.", "error");
  } finally {
    if (refreshButton) refreshButton.disabled = false;
  }
}


/* =========================================================
   RECENT CONTENT
========================================================= */

async function loadRecentContent() {
  const container = byId("recentContentList");

  if (!container || !currentAdmin) return;

  try {
    const [animes, movies] = await Promise.all([
      readCollection("animes"),
      readCollection("movies")
    ]);

    const items = [
      ...Object.entries(animes).map(([id, item]) => ({
        id, ...item, _collection: "animes", _label: "Anime Series"
      })),
      ...Object.entries(movies).map(([id, item]) => ({
        id, ...item, _collection: "movies", _label: "Anime Movie"
      }))
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

      const title = document.createElement("strong");
      title.textContent = item.title || "Untitled";

      const category = document.createElement("span");
      category.textContent = item._label;

      row.append(title, category);
      container.appendChild(row);
    });

  } catch (error) {
    console.error("Recent content:", error);
    container.textContent = "Recent content load nahi ho saka.";
  }
}


/* =========================================================
   BOTTOM NAVIGATION & MORE MENU
========================================================= */

const bottomNavigation = byId("bottomNavigation");
const moreMenu = byId("moreMenu");

// Close More Menu when clicking outside
document.addEventListener("click", (e) => {
  if (moreMenu && !moreMenu.hidden) {
    if (!moreMenu.contains(e.target) && !e.target.closest('[data-page="more"]')) {
      moreMenu.hidden = true;
    }
  }
});

// Keyboard Escape closes More menu
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    if (moreMenu) moreMenu.hidden = true;
    closeModal();
  }
});


/* =========================================================
   DYNAMIC MANAGEMENT UI STYLES
========================================================= */

function injectManagementStyles() {
  if (byId("animeManagementStyles")) return;

  const style = document.createElement("style");
  style.id = "animeManagementStyles";

  style.textContent = `
    .management-page { padding-bottom: 36px; }
    .management-toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; margin:20px 0; }
    .management-search { flex:1; min-width:180px; max-width:460px; background:var(--surface,#151523); color:var(--text,#fff); border:1px solid var(--border,#303044); border-radius:10px; padding:12px; }
    .management-button { border:0; border-radius:9px; padding:11px 15px; background:var(--primary,#8b5cf6); color:#fff; font-weight:600; cursor:pointer; }
    .management-button.secondary { background:#25253a; border:1px solid #393952; }
    .management-button.danger { background:#b91c1c; }
    .management-button:disabled { opacity:.6; cursor:wait; }
    .management-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:16px; }
    .management-card { overflow:hidden; border:1px solid var(--border,#303044); border-radius:13px; background:var(--surface,#151523); }
    .management-card img { display:block; width:100%; height:145px; object-fit:cover; background:#202033; }
    .management-card-body { padding:13px; }
    .management-card h3 { margin:0 0 7px; overflow-wrap:anywhere; }
    .management-card p { color:var(--muted,#aaa); font-size:13px; }
    .management-card-actions { display:flex; flex-wrap:wrap; gap:7px; margin-top:12px; }
    .management-empty { padding:28px 14px; text-align:center; border:1px dashed #45455b; border-radius:12px; color:var(--muted,#aaa); }
    .management-modal-backdrop { position:fixed; inset:0; z-index:10000; background:#000b; display:flex; align-items:center; justify-content:center; padding:12px; }
    .management-modal { width:min(720px,100%); max-height:92dvh; overflow:auto; background:var(--surface,#151523); color:var(--text,#fff); border:1px solid #37374e; border-radius:15px; padding:18px; }
    .management-modal h2 { margin-top:0; }
    .management-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:13px; }
    .management-field { min-width:0; }
    .management-field.full { grid-column:1/-1; }
    .management-field label { display:block; font-size:13px; margin-bottom:6px; }
    .management-field input, .management-field select, .management-field textarea { display:block; width:100%; box-sizing:border-box; padding:11px; border-radius:8px; background:#10101b; color:#fff; border:1px solid #38384f; font:inherit; }
    .management-field textarea { min-height:90px; resize:vertical; }
    .management-modal-actions { display:flex; flex-wrap:wrap; gap:9px; justify-content:flex-end; margin-top:18px; }
    .management-subsection { grid-column:1/-1; padding-top:12px; border-top:1px solid #343448; }
    .management-subsection h3 { margin:0 0 8px; font-size:15px; }
    .management-track-row { display:grid; grid-template-columns:1fr 1fr auto; gap:8px; margin:9px 0; }
    .management-track-row input, .management-track-row select { min-width:0; width:100%; box-sizing:border-box; padding:10px; border-radius:8px; background:#10101b; color:#fff; border:1px solid #38384f; }
    .management-help { font-size:12px; color:#aaa; line-height:1.5; }
    .management-preview { max-width:100%; max-height:150px; object-fit:contain; margin-top:8px; border-radius:8px; }
    .management-badge { display:inline-block; border-radius:20px; padding:4px 8px; background:#30234b; color:#d7c3ff; font-size:11px; }
    @media(max-width:520px) {
      .management-form-grid { grid-template-columns:1fr; }
      .management-field.full,.management-subsection { grid-column:auto; }
      .management-track-row { grid-template-columns:1fr; }
      .management-modal { padding:14px; }
    }
  `;

  document.head.appendChild(style);
}


/* =========================================================
   MANAGEMENT PAGES
========================================================= */

const PAGE_CONFIG = {
  anime: { title: "Anime Series", subtitle: "Anime series manage karo.", collection: "animes", type: "anime" },
  movies: { title: "Anime Movies", subtitle: "Anime movies manage karo.", collection: "movies", type: "movie" },
  episodes: { title: "Episodes", subtitle: "Season aur episode details manage karo.", collection: "episodes", type: "episode" },
  genres: { title: "Genres", subtitle: "Anime aur movie genres dekho.", collection: null, type: "genres" },
  servers: { title: "Video Servers", subtitle: "Content ke video URLs manage karo.", collection: "episodes", type: "servers" },
  subtitles: { title: "Subtitles & Audio", subtitle: "Episode ke subtitle aur audio tracks manage karo.", collection: "episodes", type: "subtitles" }
};

function ensureManagementRoot() {
  const main = byId("adminMainContent");
  if (!main) return null;

  let root = byId("managementPage");

  if (!root) {
    root = document.createElement("section");
    root.id = "managementPage";
    root.className = "admin-page management-page";
    root.hidden = true;
    root.innerHTML = `
      <div class="page-heading">
        <div>
          <span class="section-label">CONTENT MANAGEMENT</span>
          <h1 id="managementPageTitle">Management</h1>
          <p id="managementPageSubtitle"></p>
        </div>
        <button type="button" class="management-button secondary" id="managementBackButton">Dashboard</button>
      </div>
      <div id="managementPageBody"></div>
    `;

    main.appendChild(root);

    byId("managementBackButton")?.addEventListener("click", () => {
      navigateTo("dashboard");
    });
  }

  return root;
}

function showPageOnly(pageName) {
  document.querySelectorAll("[data-page-content]").forEach(section => {
    const isDashboard = section.dataset.pageContent === "dashboard";
    section.hidden = !(pageName === "dashboard" && isDashboard);
    section.style.display = section.hidden ? "none" : "";
  });

  const management = byId("managementPage");

  if (management) {
    management.hidden = pageName === "dashboard";
    management.style.display = pageName === "dashboard" ? "none" : "";
  }

  // Update Bottom Navigation Active State
  document.querySelectorAll(".bottom-nav-link").forEach(link => {
    const active = link.dataset.page === pageName;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  currentPage = pageName;
}

async function navigateTo(pageName) {
  if (!currentAdmin) {
    showLoginScreen();
    return;
  }

  // Close more menu on navigation
  if (moreMenu) moreMenu.hidden = true;

  if (pageName === "dashboard") {
    showPageOnly("dashboard");
    await loadDashboardStatistics();
    return;
  }

  if (pageName === "users" || pageName === "notifications" || pageName === "analytics" || pageName === "settings" || pageName === "profile") {
    showNotification(`${formatPageName(pageName)} management abhi implement nahi hai.`, "info");
    return;
  }

  if (!PAGE_CONFIG[pageName]) {
    showNotification("Unknown page.", "error");
    return;
  }

  showPageOnly(pageName);
  await renderManagementPage(pageName);
}

async function renderManagementPage(pageName) {
  const config = PAGE_CONFIG[pageName];
  const root = ensureManagementRoot();

  if (!root) return;

  setText("managementPageTitle", config.title);
  setText("managementPageSubtitle", config.subtitle);

  const body = byId("managementPageBody");
  if (!body) return;

  if (pageName === "genres") {
    await renderGenres(body);
    return;
  }

  if (pageName === "subtitles") {
    await renderSubtitlesPage(body);
    return;
  }

  if (pageName === "servers") {
    await renderServersPage(body);
    return;
  }

  body.innerHTML = `
    <div class="management-toolbar">
      <input id="managementSearch" class="management-search" type="search" placeholder="Search ${escapeHTML(config.title)}..." aria-label="Search content">
      <button type="button" class="management-button" id="addContentButton">
        <i class="fa fa-plus" aria-hidden="true"></i>
        Add ${escapeHTML(pageName === "anime" ? "Anime" : pageName === "movies" ? "Movie" : "Episode")}
      </button>
    </div>
    <div id="managementItems" class="management-grid">
      <div class="management-empty">Loading content...</div>
    </div>
  `;

  byId("addContentButton")?.addEventListener("click", () => {
    openContentForm(pageName);
  });

  byId("managementSearch")?.addEventListener("input", event => {
    renderContentCards(pageName, event.target.value);
  });

  await refreshCollectionCache(config.collection);
  renderContentCards(pageName, "");
}

async function refreshCollectionCache(collection) {
  const data = await readCollection(collection);
  contentCache[collection] = data;
}

function renderContentCards(pageName, query = "") {
  const config = PAGE_CONFIG[pageName];
  const container = byId("managementItems");

  if (!config || !container) return;

  const records = contentCache[config.collection] || {};
  const normalized = query.trim().toLowerCase();

  const items = Object.entries(records).filter(([id, item]) => {
    if (!item || typeof item !== "object") return false;
    const haystack = [id, item.title, item.description, item.genre, item.animeTitle].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });

  container.replaceChildren();

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "management-empty";
    empty.textContent = normalized ? "Koi matching content nahi mila." : "Abhi content nahi hai. Add button se shuru karo.";
    container.appendChild(empty);
    return;
  }

  items.forEach(([id, item]) => {
    const card = document.createElement("article");
    card.className = "management-card";

    const imageURL = safeURL(item.posterUrl || item.thumbnailUrl || item.bannerUrl);

    if (imageURL) {
      const image = document.createElement("img");
      image.src = imageURL;
      image.alt = item.title || "Content poster";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => image.remove());
      card.appendChild(image);
    }

    const content = document.createElement("div");
    content.className = "management-card-body";

    const title = document.createElement("h3");
    title.textContent = item.title || "Untitled";

    const details = document.createElement("p");
    details.textContent = getCardDetails(pageName, item);

    const badge = document.createElement("span");
    badge.className = "management-badge";
    badge.textContent = item.status || "Published";

    const actions = document.createElement("div");
    actions.className = "management-card-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "management-button secondary";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => { openContentForm(pageName, id, item); });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "management-button danger";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => { deleteContent(config.collection, id, item.title || "this item", pageName); });

    actions.append(editButton, deleteButton);
    content.append(title, details, badge, actions);
    card.appendChild(content);
    container.appendChild(card);
  });
}

function getCardDetails(pageName, item) {
  if (pageName === "episodes") {
    return `Season ${item.seasonNumber || 1} · Episode ${item.episodeNumber || "—"}`;
  }
  const year = item.releaseYear ? ` · ${item.releaseYear}` : "";
  const genre = item.genre ? ` · ${item.genre}` : "";
  return `${pageName === "movies" ? "Movie" : "Anime Series"}${year}${genre}`;
}


/* =========================================================
   URL VALIDATION
========================================================= */

function safeURL(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    return url.href;
  } catch { return ""; }
}

function validateOptionalURL(value, label) {
  if (!value) return;
  if (!safeURL(value)) throw new Error(`${label} ka valid http/https URL enter karo.`);
}


/* =========================================================
   CONTENT FORM
========================================================= */

function openContentForm(pageName, id = null, item = {}) {
  if (!currentAdmin) return;

  editingId = id;
  editingCollection = PAGE_CONFIG[pageName]?.collection || null;

  if (!editingCollection) return;

  closeModal();

  const isEpisode = pageName === "episodes";
  const isMovie = pageName === "movies";
  const heading = id ? "Edit Content" : isEpisode ? "Add Episode" : isMovie ? "Add Anime Movie" : "Add Anime Series";

  const backdrop = document.createElement("div");
  backdrop.id = "managementModalBackdrop";
  backdrop.className = "management-modal-backdrop";

  backdrop.innerHTML = `
    <section class="management-modal" role="dialog" aria-modal="true" aria-labelledby="managementModalTitle">
      <h2 id="managementModalTitle">${heading}</h2>
      <form id="contentForm">
        <div class="management-form-grid">
          ${isEpisode ? `
            <div class="management-field full">
              <label for="contentAnimeId">Anime Series</label>
              <select id="contentAnimeId" required>
                <option value="">Loading anime...</option>
              </select>
            </div>
          ` : ""}
          <div class="management-field full">
            <label for="contentTitle">Title *</label>
            <input id="contentTitle" maxlength="180" required value="${escapeHTML(item.title || "")}" placeholder="${isEpisode ? "Episode title" : "Content title"}">
          </div>
          ${isEpisode ? `
            <div class="management-field">
              <label for="contentSeason">Season Number *</label>
              <input id="contentSeason" type="number" min="1" required value="${Number(item.seasonNumber) || 1}">
            </div>
            <div class="management-field">
              <label for="contentEpisode">Episode Number *</label>
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
            <textarea id="contentDescription" maxlength="5000" placeholder="Content description">${escapeHTML(item.description || "")}</textarea>
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
            <label for="contentVideo">Google Drive / Video URL *</label>
            <input id="contentVideo" type="url" value="${escapeHTML(item.videoUrl || "")}" placeholder="https://drive.google.com/file/d/..." required>
            <p class="management-help">Drive sharing links may not play in every browser. Test the link before publishing.</p>
          </div>
          <div class="management-field">
            <label for="contentQuality">Video Quality</label>
            <select id="contentQuality">
              ${["Auto", "360p", "480p", "720p", "1080p", "1440p", "4K"].map(value => `<option ${item.quality === value ? "selected" : ""}>${value}</option>`).join("")}
            </select>
          </div>
          <div class="management-field">
            <label for="contentStatus">Status</label>
            <select id="contentStatus">
              ${["Published", "Draft", "Ongoing", "Completed"].map(value => `<option ${item.status === value ? "selected" : ""}>${value}</option>`).join("")}
            </select>
          </div>
          <div class="management-field full">
            <label for="contentSubtitleUrl">Subtitle URL (.vtt / compatible .srt)</label>
            <input id="contentSubtitleUrl" type="url" value="${escapeHTML(item.subtitleUrl || "")}" placeholder="https://.../subtitle.vtt">
          </div>
          <div class="management-field">
            <label for="contentSubtitleLanguage">Subtitle Language</label>
            <select id="contentSubtitleLanguage">
              ${LANGUAGES.map(language => `<option ${item.subtitleLanguage === language ? "selected" : ""}>${language}</option>`).join("")}
            </select>
          </div>
          <div class="management-field full">
            <label for="contentAudioUrl">Audio Track URL</label>
            <input id="contentAudioUrl" type="url" value="${escapeHTML(item.audioUrl || "")}" placeholder="https://.../audio.mp3">
          </div>
          <div class="management-field">
            <label for="contentAudioLanguage">Audio Language</label>
            <select id="contentAudioLanguage">
              ${LANGUAGES.map(language => `<option ${item.audioLanguage === language ? "selected" : ""}>${language}</option>`).join("")}
            </select>
          </div>
          <div class="management-field">
            <label for="contentAudioName">Audio Track Name</label>
            <input id="contentAudioName" maxlength="80" value="${escapeHTML(item.audioName || "")}" placeholder="Hindi Dub">
          </div>
          <div class="management-field full">
            <label for="contentExtraSubtitles">Additional Subtitle Tracks (JSON)</label>
            <textarea id="contentExtraSubtitles" placeholder='[{"language":"English","url":"https://.../en.vtt"}]'>${escapeHTML(JSON.stringify(item.subtitles || [], null, 2))}</textarea>
            <p class="management-help">Optional. Enter a JSON array of subtitle language and URL objects.</p>
          </div>
          <div class="management-field full">
            <label for="contentExtraAudio">Additional Audio Tracks (JSON)</label>
            <textarea id="contentExtraAudio" placeholder='[{"language":"Hindi","name":"Hindi Dub","url":"https://..."}]'>${escapeHTML(JSON.stringify(item.audioTracks || [], null, 2))}</textarea>
            <p class="management-help">Optional. Enter a JSON array of audio language, name and URL objects.</p>
          </div>
        </div>
        <div class="management-modal-actions">
          <button type="button" class="management-button secondary" id="cancelContentButton">Cancel</button>
          <button type="submit" class="management-button" id="saveContentButton">Save Content</button>
        </div>
      </form>
    </section>
  `;

  document.body.appendChild(backdrop);

  backdrop.addEventListener("click", event => { if (event.target === backdrop) closeModal(); });
  byId("cancelContentButton")?.addEventListener("click", closeModal);

  if (isEpisode) populateAnimeSelect(item.animeId || "");

  byId("contentForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    await saveContent(pageName, item);
  });
}

async function populateAnimeSelect(selectedId = "") {
  const select = byId("contentAnimeId");
  if (!select) return;

  try {
    const animes = await readCollection("animes");
    select.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select Anime Series";
    select.appendChild(placeholder);

    Object.entries(animes).forEach(([id, anime]) => {
      if (!anime) return;
      const option = document.createElement("option");
      option.value = id;
      option.textContent = anime.title || id;
      option.selected = id === selectedId;
      select.appendChild(option);
    });

    if (!Object.keys(animes).length) placeholder.textContent = "Pehle Anime Series add karo";
  } catch (error) {
    console.error(error);
    showNotification("Anime list load nahi ho saki.", "error");
  }
}

function parseTrackJSON(id, label, fields) {
  const text = byId(id)?.value.trim() || "[]";
  let data;

  try { data = JSON.parse(text); } catch { throw new Error(`${label} ka JSON valid nahi hai.`); }
  if (!Array.isArray(data)) throw new Error(`${label} JSON array hona chahiye.`);

  return data.map((track, index) => {
    if (!track || typeof track !== "object") throw new Error(`${label} item ${index + 1} invalid hai.`);
    const result = {};
    fields.forEach(field => { result[field] = String(track[field] || "").trim(); });
    if (!result.url || !safeURL(result.url)) throw new Error(`${label} item ${index + 1} ka URL valid nahi hai.`);
    if (!result.language) throw new Error(`${label} item ${index + 1} ki language enter karo.`);
    return result;
  });
}

async function saveContent(pageName, oldItem = {}) {
  const config = PAGE_CONFIG[pageName];
  if (!config?.collection) return;

  const button = byId("saveContentButton");

  try {
    requireAdmin();
    const title = byId("contentTitle")?.value.trim() || "";
    const videoUrl = byId("contentVideo")?.value.trim() || "";

    if (!title) throw new Error("Title required hai.");
    if (!videoUrl || !safeURL(videoUrl)) throw new Error("Valid video URL enter karo.");

    const posterUrl = byId("contentPoster")?.value.trim() || "";
    const bannerUrl = byId("contentBanner")?.value.trim() || "";
    const subtitleUrl = byId("contentSubtitleUrl")?.value.trim() || "";
    const audioUrl = byId("contentAudioUrl")?.value.trim() || "";

    validateOptionalURL(posterUrl, "Poster URL");
    validateOptionalURL(bannerUrl, "Banner URL");
    validateOptionalURL(subtitleUrl, "Subtitle URL");
    validateOptionalURL(audioUrl, "Audio URL");

    const now = Date.now();

    const data = {
      ...oldItem, title,
      description: byId("contentDescription")?.value.trim() || "",
      posterUrl, bannerUrl, videoUrl,
      quality: byId("contentQuality")?.value || "Auto",
      status: byId("contentStatus")?.value || "Published",
      subtitleUrl,
      subtitleLanguage: byId("contentSubtitleLanguage")?.value || "English",
      audioUrl,
      audioLanguage: byId("contentAudioLanguage")?.value || "Japanese",
      audioName: byId("contentAudioName")?.value.trim() || "",
      subtitles: parseTrackJSON("contentExtraSubtitles", "Additional subtitles", ["language", "url"]),
      audioTracks: parseTrackJSON("contentExtraAudio", "Additional audio", ["language", "name", "url"]),
      updatedAt: now,
      updatedBy: currentAdmin.uid
    };

    if (!oldItem.createdAt) { data.createdAt = now; data.createdBy = currentAdmin.uid; }

    if (pageName === "episodes") {
      data.animeId = byId("contentAnimeId")?.value || "";
      data.seasonNumber = Number(byId("contentSeason")?.value || 1);
      data.episodeNumber = Number(byId("contentEpisode")?.value || 1);

      if (!data.animeId) throw new Error("Episode ke liye Anime Series select karo.");
      if (data.seasonNumber < 1 || data.episodeNumber < 1) throw new Error("Season aur Episode number 1 ya usse zyada hone chahiye.");

      const animes = await readCollection("animes");
      if (!animes[data.animeId]) throw new Error("Selected Anime Series database mein nahi mili.");
      data.animeTitle = animes[data.animeId].title || "";
    } else {
      data.releaseYear = Number(byId("contentYear")?.value || 0) || null;
      data.genre = byId("contentGenre")?.value.trim() || "";
    }

    if (button) { button.disabled = true; button.textContent = "Saving..."; }

    const id = editingId || makeId();
    await set(ref(database, `${config.collection}/${id}`), data);

    closeModal();
    await refreshCollectionCache(config.collection);
    renderContentCards(pageName, byId("managementSearch")?.value || "");
    await loadDashboardStatistics();

    showNotification(editingId ? "Content update ho gaya." : "Content save ho gaya.", "success");

  } catch (error) {
    console.error("Save content error:", error);
    showNotification(firebaseErrorMessage(error), "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = "Save Content"; }
  }
}


/* =========================================================
   DELETE CONTENT
========================================================= */

async function deleteContent(collection, id, title, pageName) {
  if (!currentAdmin) return;
  if (!confirm(`"${title}" ko delete karna hai?`)) return;

  showLoader(true);
  try {
    requireAdmin();
    await remove(ref(database, `${collection}/${id}`));
    await refreshCollectionCache(collection);
    renderContentCards(pageName, byId("managementSearch")?.value || "");
    await loadDashboardStatistics();
    showNotification("Content delete ho gaya.", "success");
  } catch (error) {
    console.error("Delete error:", error);
    showNotification(firebaseErrorMessage(error), "error");
  } finally { showLoader(false); }
}


/* =========================================================
   MODAL
========================================================= */

function closeModal() {
  byId("managementModalBackdrop")?.remove();
  editingId = null;
  editingCollection = null;
}


/* =========================================================
   VIDEO SERVERS PAGE
========================================================= */

async function renderServersPage(body) {
  body.innerHTML = `
    <div class="content-card">
      <div class="card-heading"><div><h2>Video Server URLs</h2><p>Saved episodes aur movies ke video links yahan dekho.</p></div></div>
      <div class="management-toolbar"><input id="serverSearch" class="management-search" type="search" placeholder="Search video URLs..."></div>
      <div id="serverList" class="management-grid"><div class="management-empty">Loading...</div></div>
    </div>
  `;

  const [episodes, movies] = await Promise.all([readCollection("episodes"), readCollection("movies")]);
  const rows = [
    ...Object.entries(episodes).map(([id, item]) => ({ ...item, id, collection: "episodes" })),
    ...Object.entries(movies).map(([id, item]) => ({ ...item, id, collection: "movies" }))
  ];

  const list = byId("serverList");

  function draw(query = "") {
    list.replaceChildren();
    const filtered = rows.filter(item => `${item.title || ""} ${item.videoUrl || ""}`.toLowerCase().includes(query.toLowerCase()));

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "management-empty";
      empty.textContent = "Koi video URL nahi mila.";
      list.appendChild(empty);
      return;
    }

    filtered.forEach(item => {
      const card = document.createElement("article");
      card.className = "management-card management-card-body";
      const title = document.createElement("h3"); title.textContent = item.title || "Untitled";
      const type = document.createElement("p"); type.textContent = item.collection === "movies" ? "Anime Movie" : "Episode";
      const link = document.createElement("a"); link.href = safeURL(item.videoUrl) || "#"; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Open video link";
      card.append(title, type, link); list.appendChild(card);
    });
  }

  byId("serverSearch")?.addEventListener("input", event => { draw(event.target.value); });
  draw();
}


/* =========================================================
   SUBTITLES & AUDIO PAGE
========================================================= */

async function renderSubtitlesPage(body) {
  body.innerHTML = `
    <div class="content-card">
      <div class="card-heading"><div><h2>Subtitles & Audio Tracks</h2><p>Episodes mein save kiye gaye subtitle aur audio URLs dekho.</p></div></div>
      <div class="management-toolbar"><input id="trackSearch" class="management-search" type="search" placeholder="Search title or language..."></div>
      <div id="trackList" class="management-grid"><div class="management-empty">Loading...</div></div>
    </div>
  `;

  const [episodes, movies] = await Promise.all([readCollection("episodes"), readCollection("movies")]);
  const rows = [
    ...Object.entries(episodes).map(([id, item]) => ({ ...item, id, collection: "episodes" })),
    ...Object.entries(movies).map(([id, item]) => ({ ...item, id, collection: "movies" }))
  ];

  const list = byId("trackList");

  function draw(query = "") {
    list.replaceChildren();
    const filtered = rows.filter(item => {
      const text = JSON.stringify({ title: item.title, subtitleLanguage: item.subtitleLanguage, audioLanguage: item.audioLanguage, subtitles: item.subtitles, audioTracks: item.audioTracks }).toLowerCase();
      return text.includes(query.toLowerCase());
    });

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "management-empty";
      empty.textContent = "Koi matching subtitle/audio entry nahi mili.";
      list.appendChild(empty);
      return;
    }

    filtered.forEach(item => {
      const card = document.createElement("article");
      card.className = "management-card management-card-body";
      const title = document.createElement("h3"); title.textContent = item.title || "Untitled";
      const subtitles = [...(item.subtitleUrl ? [{ language: item.subtitleLanguage || "Unknown", url: item.subtitleUrl }] : []), ...(Array.isArray(item.subtitles) ? item.subtitles : [])];
      const audioTracks = [...(item.audioUrl ? [{ language: item.audioLanguage || "Unknown", name: item.audioName || "", url: item.audioUrl }] : []), ...(Array.isArray(item.audioTracks) ? item.audioTracks : [])];
      const subtitleText = document.createElement("p"); subtitleText.textContent = `Subtitles: ${subtitles.length}`;
      const audioText = document.createElement("p"); audioText.textContent = `Audio tracks: ${audioTracks.length}`;
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "management-button secondary"; edit.textContent = "Edit";
      edit.addEventListener("click", () => { const pageName = item.collection === "movies" ? "movies" : "episodes"; openContentForm(pageName, item.id, item); });
      card.append(title, subtitleText, audioText, edit); list.appendChild(card);
    });
  }

  byId("trackSearch")?.addEventListener("input", event => { draw(event.target.value); });
  draw();
}


/* =========================================================
   GENRES PAGE
========================================================= */

async function renderGenres(body) {
  body.innerHTML = `
    <div class="content-card">
      <div class="card-heading"><div><h2>Genres</h2><p>Anime aur movies mein use kiye gaye genres.</p></div></div>
      <div id="genreList" class="management-grid"><div class="management-empty">Loading genres...</div></div>
    </div>
  `;

  const [animes, movies] = await Promise.all([readCollection("animes"), readCollection("movies")]);
  const genres = new Set();

  [...Object.values(animes), ...Object.values(movies)].forEach(item => {
    if (!item?.genre) return;
    item.genre.split(",").forEach(genre => { const normalized = genre.trim(); if (normalized) genres.add(normalized); });
  });

  const list = byId("genreList");
  list.replaceChildren();

  if (!genres.size) {
    const empty = document.createElement("div");
    empty.className = "management-empty";
    empty.textContent = "Genres dikhane ke liye pehle anime ya movie add karo.";
    list.appendChild(empty);
    return;
  }

  [...genres].sort().forEach(genre => {
    const badge = document.createElement("div");
    badge.className = "management-card management-card-body";
    badge.textContent = genre;
    list.appendChild(badge);
  });
}


/* =========================================================
   NAVIGATION EVENTS (BOTTOM NAV + MORE MENU)
========================================================= */

// Bottom Navigation Links
document.querySelectorAll(".bottom-nav-link").forEach(link => {
  link.addEventListener("click", event => {
    event.preventDefault();
    const pageName = link.dataset.page;

    if (pageName === "more") {
      if (moreMenu) moreMenu.hidden = !moreMenu.hidden;
    } else {
      navigateTo(pageName);
    }
  });
});

// More Menu Links
document.querySelectorAll("#moreMenu button[data-page]").forEach(btn => {
  btn.addEventListener("click", () => {
    navigateTo(btn.dataset.page);
  });
});

// Quick Action Buttons
document.querySelectorAll("[data-action]").forEach(button => {
  button.addEventListener("click", () => {
    if (!currentAdmin) { showLoginScreen(); return; }

    const action = button.dataset.action;
    const pageMap = {
      "add-anime": "anime",
      "add-movie": "movies",
      "add-episode": "episodes",
      "send-notification": "notifications"
    };

    const pageName = pageMap[action];

    if (pageName === "notifications") {
      showNotification("Notification management abhi implement nahi hai.", "info");
      return;
    }

    navigateTo(pageName).then(() => {
      if (["anime", "movies", "episodes"].includes(pageName)) {
        openContentForm(pageName);
      }
    });
  });
});

const refreshDashboardButton = byId("refreshDashboardButton");

refreshDashboardButton?.addEventListener("click", async () => {
  if (!currentAdmin) return;
  showLoader(true);
  try {
    await loadDashboardStatistics();
    showNotification("Dashboard refresh ho gaya.", "success");
  } finally { showLoader(false); }
});

byId("viewAllContentButton")?.addEventListener("click", () => {
  navigateTo("anime");
});


/* =========================================================
   GLOBAL ERROR HANDLERS
========================================================= */

window.addEventListener("error", event => { console.error("Application error:", event.error || event.message); });
window.addEventListener("unhandledrejection", event => { console.error("Unhandled promise rejection:", event.reason); });


/* =========================================================
   START APPLICATION
========================================================= */

async function startApplication() {
  initializeUI();

  if (!initializeFirebase()) {
    showLoader(false);
    return;
  }

  startAuthListener();
}

startApplication();
