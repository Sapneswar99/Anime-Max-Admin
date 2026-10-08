/* =========================================================
   ANIME MAX ADMIN PANEL
   Firebase Authentication + Realtime Database Admins
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
  get
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
   APPLICATION STATE
========================================================= */

let app = null;
let auth = null;
let database = null;

let currentAdmin = null;
let notificationTimer = null;
let loginInProgress = false;
let authListenerStarted = false;

const byId = (id) => document.getElementById(id);


/* =========================================================
   DOM ELEMENTS
========================================================= */

const pageLoader = byId("pageLoader");
const notificationMessage = byId("notificationMessage");
const loginScreen = byId("loginScreen");
const adminApp = byId("adminApp");
const adminLoginForm = byId("adminLoginForm");
const adminEmail = byId("adminEmail");
const adminPassword = byId("adminPassword");
const togglePassword = byId("togglePassword");
const rememberAdmin = byId("rememberAdmin");
const forgotPasswordButton = byId("forgotPasswordButton");
const adminLoginButton = byId("adminLoginButton");
const loginError = byId("loginError");
const logoutButton = byId("logoutButton");
const menuToggle = byId("menuToggle");
const sidebarOverlay = byId("sidebarOverlay");
const adminSidebar = byId("adminSidebar");
const sidebarAdminName = byId("sidebarAdminName");
const sidebarAdminEmail = byId("sidebarAdminEmail");
const currentYear = byId("currentYear");
const dashboardYear = byId("dashboardYear");
const firebaseStatus = byId("firebaseStatus");
const authStatus = byId("authStatus");
const refreshDashboardButton = byId("refreshDashboardButton");


/* =========================================================
   LOADER & UI HELPERS
========================================================= */

function showLoader(show = true) {
  if (!pageLoader) return;
  pageLoader.hidden = !show;
  pageLoader.classList.toggle("hidden", !show);
  pageLoader.classList.toggle("is-hidden", !show);
  pageLoader.setAttribute("aria-hidden", String(!show));
}

function showLoginScreen() {
  if (loginScreen) {
    loginScreen.hidden = false;
    loginScreen.style.display = "";
    loginScreen.setAttribute("aria-hidden", "false");
  }
  if (adminApp) {
    adminApp.hidden = true;
    adminApp.style.display = "none";
    adminApp.setAttribute("aria-hidden", "true");
  }
}

function showAdminDashboard() {
  if (loginScreen) {
    loginScreen.hidden = true;
    loginScreen.style.display = "none";
    loginScreen.setAttribute("aria-hidden", "true");
  }
  if (adminApp) {
    adminApp.hidden = false;
    adminApp.style.display = "";
    adminApp.setAttribute("aria-hidden", "false");
  }
}

function showLoginError(message = "") {
  if (!loginError) {
    if (message) console.error("Login:", message);
    return;
  }
  loginError.textContent = message;
  loginError.hidden = !message;
}

function showNotification(message, type = "success") {
  if (!notificationMessage) {
    console.log(`[${type}] ${message}`);
    return;
  }
  clearTimeout(notificationTimer);
  notificationMessage.textContent = message;
  notificationMessage.className = `notification-message ${type} show`;
  notificationMessage.hidden = false;
  notificationMessage.setAttribute("role", "status");
  notificationTimer = setTimeout(() => {
    notificationMessage.hidden = true;
    notificationMessage.classList.remove("show");
  }, 4000);
}

function getFirebaseErrorMessage(error) {
  const code = error?.code || "";
  const messages = {
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/missing-password": "Please enter your password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/user-not-found": "Incorrect email or password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network error. Check your internet connection.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/operation-not-allowed": "Email/password login is not enabled in Firebase.",
    "auth/unauthorized-domain": "This website domain is not authorized in Firebase.",
    "auth/invalid-api-key": "Firebase API key is invalid.",
    "auth/weak-password": "Please use a stronger password.",
    "auth/email-already-in-use": "This email is already registered.",
    "database/permission-denied": "Database access denied. Check your Realtime Database rules."
  };
  if (code === "PERMISSION_DENIED") return messages["database/permission-denied"];
  return messages[code] || `Something went wrong. ${code || "Please try again."}`;
}


/* =========================================================
   FIREBASE INITIALIZATION
========================================================= */

function initializeFirebase() {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    database = getDatabase(app);
    if (firebaseStatus) firebaseStatus.textContent = "Connected";
    console.log("Firebase initialized.");
    return true;
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    app = null; auth = null; database = null;
    if (firebaseStatus) firebaseStatus.textContent = "Not connected";
    showLoginError("Firebase initialization failed.");
    return false;
  }
}

function initializeUI() {
  const year = new Date().getFullYear();
  if (currentYear) currentYear.textContent = year;
  if (dashboardYear) dashboardYear.textContent = year;
  showLoginScreen();
  closeSidebar();
}


/* =========================================================
   ADMIN AUTHORIZATION (WITH DEBUGGING)
========================================================= */

async function verifyAdminAccess(user) {
  if (!user || !database) return false;

  try {
    const adminRef = ref(database, `admins/${user.uid}`);
    const snapshot = await get(adminRef);

    console.log("========== ADMIN CHECK DEBUG ==========");
    console.log("1. Logged in UID:", user.uid);

    if (!snapshot.exists()) {
      console.error("2. ERROR: Yeh UID database ke 'admins' folder mein nahi mila!");
      throw new Error("Access denied. This Firebase UID is not listed in the database.");
    }

    const adminData = snapshot.val();
    console.log("2. Database se mila data:", adminData);

    const isAdmin = adminData === true || adminData?.role === "admin";
    console.log("3. Kya admin check pass hua?:", isAdmin);
    console.log("=======================================");

    if (!isAdmin) {
      throw new Error("Access denied. UID mil gaya, lekin data galat format mein hai. Database mein 'role: \"admin\"' hona chahiye.");
    }

    return true;

  } catch (error) {
    console.error("Admin verification failed:", error);
    if (error?.code === "PERMISSION_DENIED" || error?.code === "database/permission-denied") {
      throw new Error("Database Rules block kar rahe hain! Firebase Console -> Realtime Database -> Rules mein jaakar '.read': true aur '.write': true karke Publish karein.");
    }
    throw error;
  }
}


/* =========================================================
   PASSWORD VISIBILITY
========================================================= */

if (togglePassword && adminPassword) {
  togglePassword.addEventListener("click", () => {
    const isPassword = adminPassword.type === "password";
    adminPassword.type = isPassword ? "text" : "password";
    togglePassword.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
    togglePassword.setAttribute("aria-pressed", String(isPassword));
    const icon = togglePassword.querySelector("i");
    if (icon) {
      icon.classList.toggle("fa-eye", !isPassword);
      icon.classList.toggle("fa-eye-slash", isPassword);
    }
  });
}


/* =========================================================
   LOGIN
========================================================= */

if (adminLoginForm) {
  adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (loginInProgress) return;
    if (!auth || !database) {
      showLoginError("Firebase is unavailable. Please refresh the page.");
      return;
    }

    const email = adminEmail?.value.trim() || "";
    const password = adminPassword?.value || "";

    if (!email || !password) {
      showLoginError("Enter your email and password.");
      return;
    }

    loginInProgress = true;
    showLoginError("");
    showLoader(true);

    if (adminLoginButton) {
      adminLoginButton.disabled = true;
      adminLoginButton.setAttribute("aria-busy", "true");
      if (!adminLoginButton.dataset.originalText) {
        adminLoginButton.dataset.originalText = adminLoginButton.textContent.trim();
      }
      adminLoginButton.textContent = "Signing in...";
    }

    try {
      const persistence = rememberAdmin?.checked ? browserLocalPersistence : browserSessionPersistence;
      await setPersistence(auth, persistence);

      const credential = await signInWithEmailAndPassword(auth, email, password);
      const isAdmin = await verifyAdminAccess(credential.user);

      if (!isAdmin) throw new Error("Access denied.");

      currentAdmin = credential.user;
      if (sidebarAdminEmail) sidebarAdminEmail.textContent = credential.user.email || "Admin";
      if (sidebarAdminName) sidebarAdminName.textContent = credential.user.displayName || credential.user.email?.split("@")[0] || "Admin";
      if (authStatus) authStatus.textContent = "Authenticated";

      showAdminDashboard();
      await loadDashboardStatistics();
      showNotification("Admin login successful.", "success");

    } catch (error) {
      console.error("Login error:", error);
      if (auth?.currentUser) {
        try { await signOut(auth); } catch (signOutError) { console.error(signOutError); }
      }
      currentAdmin = null;
      showLoginScreen();

      // Custom errors ko UI par dikhayein
      const customMessages = ["Access denied", "Database Rules"];
      const isCustom = customMessages.some(msg => error?.message?.includes(msg));

      showLoginError(isCustom ? error.message : getFirebaseErrorMessage(error));

    } finally {
      loginInProgress = false;
      if (adminLoginButton) {
        adminLoginButton.disabled = false;
        adminLoginButton.removeAttribute("aria-busy");
        adminLoginButton.textContent = adminLoginButton.dataset.originalText || "Sign In";
      }
      showLoader(false);
    }
  });
}


/* =========================================================
   FORGOT PASSWORD
========================================================= */

if (forgotPasswordButton) {
  forgotPasswordButton.addEventListener("click", async () => {
    if (!auth) { showNotification("Firebase Auth unavailable.", "error"); return; }
    const email = adminEmail?.value.trim() || "";
    if (!email) { showLoginError("Enter your email address first."); adminEmail?.focus(); return; }
    showLoginError("");
    showLoader(true);
    try {
      await sendPasswordResetEmail(auth, email);
      showNotification("Password reset email sent.", "success");
    } catch (error) {
      console.error(error);
      showNotification(getFirebaseErrorMessage(error), "error");
    } finally {
      showLoader(false);
    }
  });
}


/* =========================================================
   LOGOUT
========================================================= */

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    if (!auth) return;
    if (!window.confirm("Are you sure you want to log out?")) return;
    showLoader(true);
    try {
      await signOut(auth);
      currentAdmin = null; closeSidebar(); showLoginScreen();
      showNotification("You have been logged out.", "success");
    } catch (error) {
      console.error(error);
      showNotification(getFirebaseErrorMessage(error), "error");
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

  onAuthStateChanged(auth, async (user) => {
    showLoader(true);
    try {
      if (!user) {
        currentAdmin = null; showLoginScreen();
        if (authStatus) authStatus.textContent = "Signed out";
        showLoginError("");
        return;
      }

      const isAdmin = await verifyAdminAccess(user);
      if (!isAdmin) throw new Error("Access denied.");

      currentAdmin = user;
      if (sidebarAdminEmail) sidebarAdminEmail.textContent = user.email || "Admin";
      if (sidebarAdminName) sidebarAdminName.textContent = user.displayName || user.email?.split("@")[0] || "Admin";
      if (authStatus) authStatus.textContent = "Authenticated";

      showLoginError("");
      showAdminDashboard();
      await loadDashboardStatistics();

    } catch (error) {
      console.error("Auth state error:", error);
      currentAdmin = null;
      if (authStatus) authStatus.textContent = "Verification failed";
      try { if (auth?.currentUser) await signOut(auth); } catch (e) { console.error(e); }
      showLoginScreen();

      const customMessages = ["Access denied", "Database Rules"];
      const isCustom = customMessages.some(msg => error?.message?.includes(msg));
      showLoginError(isCustom ? error.message : "Unable to verify admin access. Check Firebase permissions.");

    } finally {
      showLoader(false);
    }
  }, (error) => {
    console.error("Auth listener error:", error);
    currentAdmin = null; showLoginScreen();
    showLoginError(getFirebaseErrorMessage(error));
    showLoader(false);
  });
}


/* =========================================================
   DATABASE ITEM COUNT & STATISTICS
========================================================= */

async function countDatabaseItems(path) {
  if (!database) throw new Error("Database unavailable.");
  const snapshot = await get(ref(database, path));
  if (!snapshot.exists()) return 0;
  const value = snapshot.val();
  if (Array.isArray(value)) return value.filter((item) => item !== null).length;
  if (value !== null && typeof value === "object") return Object.keys(value).length;
  return 0;
}

function updateCount(elementId, value) {
  const element = byId(elementId);
  if (element) element.textContent = String(value);
}

async function loadDashboardStatistics() {
  if (!currentAdmin || !database) return;
  if (refreshDashboardButton) refreshDashboardButton.disabled = true;

  try {
    const results = await Promise.allSettled([
      countDatabaseItems("animes"),
      countDatabaseItems("movies"),
      countDatabaseItems("episodes"),
      countDatabaseItems("users")
    ]);

    const elementIds = ["totalAnimeCount", "totalMoviesCount", "totalEpisodesCount", "totalUsersCount"];
    results.forEach((result, index) => {
      const elementId = elementIds[index];
      if (result.status === "fulfilled") updateCount(elementId, result.value);
      else { console.error(`Error ${elementId}:`, result.reason); updateCount(elementId, "—"); }
    });

    await loadRecentContent();
  } catch (error) {
    console.error("Dashboard error:", error);
    showNotification("Some dashboard data could not be loaded.", "error");
  } finally {
    if (refreshDashboardButton) refreshDashboardButton.disabled = false;
  }
}

async function loadRecentContent() {
  const container = byId("recentContentList");
  if (!container || !database || !currentAdmin) return;
  container.replaceChildren();
  const emptyMessage = document.createElement("p");
  emptyMessage.className = "empty-state";
  emptyMessage.textContent = "Your recent content will appear here.";
  container.appendChild(emptyMessage);
}


/* =========================================================
   MOBILE SIDEBAR & NAVIGATION
========================================================= */

function openSidebar() {
  if (adminSidebar) { adminSidebar.classList.add("active", "open"); adminSidebar.setAttribute("aria-hidden", "false"); }
  if (sidebarOverlay) { sidebarOverlay.hidden = false; sidebarOverlay.classList.add("active", "visible"); }
  if (menuToggle) menuToggle.setAttribute("aria-expanded", "true");
  document.body.classList.add("sidebar-open");
}

function closeSidebar() {
  if (adminSidebar) { adminSidebar.classList.remove("active", "open"); adminSidebar.setAttribute("aria-hidden", "true"); }
  if (sidebarOverlay) { sidebarOverlay.classList.remove("active", "visible"); sidebarOverlay.hidden = true; }
  if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
  document.body.classList.remove("sidebar-open");
}

if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    const isOpen = adminSidebar?.classList.contains("active") || adminSidebar?.classList.contains("open");
    if (isOpen) closeSidebar(); else openSidebar();
  });
}

if (sidebarOverlay) sidebarOverlay.addEventListener("click", closeSidebar);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSidebar(); });

const navigationLinks = document.querySelectorAll("[data-page]");
const implementedPages = new Set(["dashboard"]);

navigationLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const pageName = link.dataset.page || "";
    closeSidebar();
    if (!currentAdmin) { showLoginScreen(); return; }

    if (pageName === "dashboard") {
      navigationLinks.forEach((item) => item.classList.toggle("active", item.dataset.page === "dashboard"));
      const dashboardPage = byId("dashboardPage");
      if (dashboardPage) { dashboardPage.hidden = false; dashboardPage.style.display = ""; }
      loadDashboardStatistics();
      return;
    }

    if (!implementedPages.has(pageName)) {
      showNotification(`${formatPageName(pageName)} page is not implemented yet.`, "info");
    }
  });
});

function formatPageName(name = "") {
  return name.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!currentAdmin) { showLoginScreen(); return; }
    const action = button.dataset.action || "";
    showNotification(`${formatPageName(action)} is not implemented yet.`, "info");
  });
});

if (refreshDashboardButton) {
  refreshDashboardButton.addEventListener("click", async () => {
    if (!currentAdmin) return;
    showLoader(true);
    try {
      await loadDashboardStatistics();
      showNotification("Dashboard refresh completed.", "success");
    } finally { showLoader(false); }
  });
}

const viewAllContentButton = byId("viewAllContentButton");
if (viewAllContentButton) {
  viewAllContentButton.addEventListener("click", () => {
    showNotification("The complete content list is not implemented yet.", "info");
  });
}


/* =========================================================
   GLOBAL ERROR & START
========================================================= */

window.addEventListener("error", (event) => console.error("App Error:", event.error || event.message));
window.addEventListener("unhandledrejection", (event) => console.error("Unhandled Rejection:", event.reason));

async function startApplication() {
  try {
    initializeUI();
    const firebaseReady = initializeFirebase();
    if (!firebaseReady) { showLoader(false); return; }
    startAuthListener();
  } catch (error) {
    console.error("App Startup Failed:", error);
    showLoginScreen();
    showLoginError("The admin panel could not start. Refresh the page.");
  } finally {
    if (!authListenerStarted) showLoader(false);
  }
}

startApplication();
