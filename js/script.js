/* =========================================================
   ANIME MAX ADMIN PANEL
   Firebase Authentication + Dashboard
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
  child
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
   INITIALIZE FIREBASE
========================================================= */

let app;
let auth;
let database;

try {
  app = getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);

  auth = getAuth(app);
  database = getDatabase(app);

} catch (error) {
  console.error("Firebase initialization failed:", error);
}


/* =========================================================
   DOM ELEMENTS
========================================================= */

const $ = (selector) => document.querySelector(selector);

const pageLoader = $("#pageLoader");
const notificationMessage = $("#notificationMessage");

const loginScreen = $("#loginScreen");
const adminApp = $("#adminApp");

const adminLoginForm = $("#adminLoginForm");
const adminEmail = $("#adminEmail");
const adminPassword = $("#adminPassword");

const togglePassword = $("#togglePassword");
const rememberAdmin = $("#rememberAdmin");

const forgotPasswordButton = $("#forgotPasswordButton");
const adminLoginButton = $("#adminLoginButton");
const loginError = $("#loginError");

const logoutButton = $("#logoutButton");

const menuToggle = $("#menuToggle");
const sidebarOverlay = $("#sidebarOverlay");
const adminSidebar = $("#adminSidebar");

const sidebarAdminName = $("#sidebarAdminName");
const sidebarAdminEmail = $("#sidebarAdminEmail");

const currentYear = $("#currentYear");
const dashboardYear = $("#dashboardYear");

const firebaseStatus = $("#firebaseStatus");
const authStatus = $("#authStatus");

const refreshDashboardButton = $("#refreshDashboardButton");


/* =========================================================
   APPLICATION STATE
========================================================= */

let currentAdmin = null;
let notificationTimer = null;
let loginInProgress = false;


/* =========================================================
   GENERAL UTILITIES
========================================================= */

function showLoader(show = true) {
  if (!pageLoader) return;

  pageLoader.classList.toggle("hidden", !show);
  pageLoader.setAttribute("aria-hidden", String(!show));
}

function showLoginScreen() {
  if (loginScreen) {
    loginScreen.hidden = false;
    loginScreen.style.display = "";
  }

  if (adminApp) {
    adminApp.hidden = true;
    adminApp.style.display = "none";
  }
}

function showAdminDashboard() {
  if (loginScreen) {
    loginScreen.hidden = true;
    loginScreen.style.display = "none";
  }

  if (adminApp) {
    adminApp.hidden = false;
    adminApp.style.display = "";
  }
}

function showLoginError(message = "") {
  if (!loginError) return;

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
  notificationMessage.className = `notification-message ${type}`;
  notificationMessage.hidden = false;

  notificationMessage.setAttribute("role", "status");

  notificationTimer = setTimeout(() => {
    notificationMessage.hidden = true;
  }, 4000);
}

function getFirebaseErrorMessage(error) {
  const code = error?.code || "";

  const messages = {
    "auth/invalid-email":
      "Please enter a valid email address.",

    "auth/missing-password":
      "Please enter your password.",

    "auth/invalid-credential":
      "Incorrect email or password.",

    "auth/user-not-found":
      "Incorrect email or password.",

    "auth/wrong-password":
      "Incorrect email or password.",

    "auth/too-many-requests":
      "Too many attempts. Please try again later.",

    "auth/network-request-failed":
      "Network error. Check your internet connection.",

    "auth/user-disabled":
      "This account has been disabled.",

    "auth/operation-not-allowed":
      "Email/password login is not enabled in Firebase.",

    "auth/weak-password":
      "Please use a stronger password.",

    "auth/email-already-in-use":
      "This email is already registered."
  };

  return messages[code] ||
    "Something went wrong. Please try again.";
}


/* =========================================================
   INITIAL UI SETUP
========================================================= */

function initializeUI() {
  const year = new Date().getFullYear();

  if (currentYear) {
    currentYear.textContent = year;
  }

  if (dashboardYear) {
    dashboardYear.textContent = year;
  }

  showLoginScreen();
  closeSidebar();

  if (!app || !auth || !database) {
    if (firebaseStatus) {
      firebaseStatus.textContent = "Not connected";
    }

    showLoginError(
      "Firebase could not initialize. Check your configuration and internet connection."
    );

    showLoader(false);
    return;
  }

  if (firebaseStatus) {
    firebaseStatus.textContent = "Configured";
  }
}


/* =========================================================
   PASSWORD VISIBILITY
========================================================= */

if (togglePassword && adminPassword) {
  togglePassword.addEventListener("click", () => {
    const isPassword =
      adminPassword.type === "password";

    adminPassword.type = isPassword
      ? "text"
      : "password";

    togglePassword.setAttribute(
      "aria-label",
      isPassword ? "Hide password" : "Show password"
    );

    togglePassword.setAttribute(
      "aria-pressed",
      String(isPassword)
    );

    const icon = togglePassword.querySelector("i");

    if (icon) {
      icon.classList.toggle("fa-eye", !isPassword);
      icon.classList.toggle("fa-eye-slash", isPassword);
    }
  });
}


/* =========================================================
   ADMIN AUTHORIZATION
========================================================= */

/*
  IMPORTANT:
  This code checks the Firebase custom claim "admin".

  A user must have:
      admin: true

  in their Firebase Authentication custom claims.

  Custom claims must be assigned through a trusted
  Firebase Admin SDK environment.

  Never trust a client-side email check as admin security.
*/

async function verifyAdminAccess(user) {
  if (!user) return false;

  try {
    const tokenResult = await user.getIdTokenResult(true);

    return tokenResult.claims?.admin === true;

  } catch (error) {
    console.error("Admin verification failed:", error);
    return false;
  }
}


/* =========================================================
   LOGIN
========================================================= */

if (adminLoginForm) {
  adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (loginInProgress) return;

    if (!auth) {
      showLoginError("Firebase Authentication is unavailable.");
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

    if (adminLoginButton) {
      adminLoginButton.disabled = true;
      adminLoginButton.setAttribute("aria-busy", "true");

      adminLoginButton.dataset.originalText =
        adminLoginButton.textContent;

      adminLoginButton.textContent = "Signing in...";
    }

    showLoader(true);

    try {
      const persistence = rememberAdmin?.checked
        ? browserLocalPersistence
        : browserSessionPersistence;

      await setPersistence(auth, persistence);

      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      const isAdmin = await verifyAdminAccess(
        credential.user
      );

      if (!isAdmin) {
        await signOut(auth);

        showLoginScreen();

        showLoginError(
          "Access denied. This account is not authorized as an admin."
        );

        return;
      }

      showNotification("Admin login successful.", "success");

    } catch (error) {
      console.error("Login error:", error);
      showLoginError(getFirebaseErrorMessage(error));

    } finally {
      loginInProgress = false;

      if (adminLoginButton) {
        adminLoginButton.disabled = false;
        adminLoginButton.removeAttribute("aria-busy");

        adminLoginButton.textContent =
          adminLoginButton.dataset.originalText ||
          "Sign In";
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
    if (!auth) {
      showNotification(
        "Firebase Authentication is unavailable.",
        "error"
      );
      return;
    }

    const email = adminEmail?.value.trim() || "";

    if (!email) {
      showLoginError(
        "Enter your email address first, then select Forgot Password."
      );

      adminEmail?.focus();
      return;
    }

    showLoginError("");
    showLoader(true);

    try {
      await sendPasswordResetEmail(auth, email);

      showNotification(
        "If this account exists, a password reset email will be sent.",
        "success"
      );

    } catch (error) {
      console.error("Password reset error:", error);

      showNotification(
        error?.code === "auth/network-request-failed"
          ? "Network error. Check your internet connection."
          : "Unable to send the reset email. Check your email and Firebase settings.",
        "error"
      );

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

    const confirmed = window.confirm(
      "Are you sure you want to log out?"
    );

    if (!confirmed) return;

    showLoader(true);

    try {
      await signOut(auth);

      currentAdmin = null;
      closeSidebar();

      showLoginScreen();
      showNotification("You have been logged out.", "success");

    } catch (error) {
      console.error("Logout error:", error);

      showNotification(
        "Unable to log out. Please try again.",
        "error"
      );

    } finally {
      showLoader(false);
    }
  });
}


/* =========================================================
   AUTH STATE LISTENER
========================================================= */

if (auth) {
  onAuthStateChanged(auth, async (user) => {
    showLoader(true);

    try {
      if (!user) {
        currentAdmin = null;

        showLoginScreen();

        if (authStatus) {
          authStatus.textContent = "Signed out";
        }

        return;
      }

      const isAdmin = await verifyAdminAccess(user);

      if (!isAdmin) {
        currentAdmin = null;

        await signOut(auth);

        showLoginScreen();

        showLoginError(
          "Access denied. Ask the system administrator to authorize your account."
        );

        if (authStatus) {
          authStatus.textContent = "Unauthorized";
        }

        return;
      }

      currentAdmin = user;

      if (sidebarAdminEmail) {
        sidebarAdminEmail.textContent =
          user.email || "Admin";
      }

      if (sidebarAdminName) {
        sidebarAdminName.textContent =
          user.displayName ||
          (user.email ? user.email.split("@")[0] : "Admin");
      }

      if (authStatus) {
        authStatus.textContent = "Authenticated";
      }

      showAdminDashboard();

      await loadDashboardStatistics();

    } catch (error) {
      console.error("Authentication state error:", error);

      showLoginScreen();

      showLoginError(
        "Unable to verify admin access. Check your Firebase configuration and security settings."
      );

    } finally {
      showLoader(false);
    }
  });
}


/* =========================================================
   DASHBOARD STATISTICS
========================================================= */

async function countDatabaseItems(path) {
  if (!database) {
    throw new Error("Firebase Database is unavailable.");
  }

  const snapshot = await get(ref(database, path));

  if (!snapshot.exists()) {
    return 0;
  }

  const value = snapshot.val();

  if (Array.isArray(value)) {
    return value.filter((item) => item !== null).length;
  }

  if (value && typeof value === "object") {
    return Object.keys(value).length;
  }

  return 0;
}

function updateCount(elementId, value) {
  const element = document.getElementById(elementId);

  if (element) {
    element.textContent = String(value);
  }
}

async function loadDashboardStatistics() {
  if (!currentAdmin || !database) return;

  if (refreshDashboardButton) {
    refreshDashboardButton.disabled = true;
  }

  try {
    /*
      These are assumed database paths.
      Confirm your actual Firebase Realtime Database structure
      before relying on these counts.
    */

    const results = await Promise.allSettled([
      countDatabaseItems("animes"),
      countDatabaseItems("movies"),
      countDatabaseItems("episodes"),
      countDatabaseItems("users")
    ]);

    const elementIds = [
      "totalAnimeCount",
      "totalMoviesCount",
      "totalEpisodesCount",
      "totalUsersCount"
    ];

    results.forEach((result, index) => {
      const elementId = elementIds[index];

      if (result.status === "fulfilled") {
        updateCount(elementId, result.value);
      } else {
        console.warn(
          `Unable to load ${elementId}:`,
          result.reason
        );

        updateCount(elementId, "—");
      }
    });

    await loadRecentContent();

  } catch (error) {
    console.error("Dashboard loading error:", error);

    showNotification(
      "Some dashboard data could not be loaded.",
      "error"
    );

  } finally {
    if (refreshDashboardButton) {
      refreshDashboardButton.disabled = false;
    }
  }
}


/* =========================================================
   RECENT CONTENT
========================================================= */

async function loadRecentContent() {
  const container = $("#recentContentList");

  if (!container || !database || !currentAdmin) return;

  container.replaceChildren();

  const emptyMessage = document.createElement("p");
  emptyMessage.className = "empty-state";
  emptyMessage.textContent =
    "Recent content will appear here when content loading is configured.";

  container.appendChild(emptyMessage);

  /*
    The exact Anime Max content schema has not yet been
    confirmed. This function intentionally does not invent
    fields or display incorrect content.

    Once the actual database structure is confirmed, this
    section can render real anime, movies and episodes.
  */
}


/* =========================================================
   MOBILE SIDEBAR
========================================================= */

function openSidebar() {
  if (adminSidebar) {
    adminSidebar.classList.add("active");
    adminSidebar.setAttribute("aria-hidden", "false");
  }

  if (sidebarOverlay) {
    sidebarOverlay.classList.add("active");
    sidebarOverlay.hidden = false;
  }

  if (menuToggle) {
    menuToggle.setAttribute("aria-expanded", "true");
  }

  document.body.classList.add("sidebar-open");
}

function closeSidebar() {
  if (adminSidebar) {
    adminSidebar.classList.remove("active");
    adminSidebar.setAttribute("aria-hidden", "true");
  }

  if (sidebarOverlay) {
    sidebarOverlay.classList.remove("active");
    sidebarOverlay.hidden = true;
  }

  if (menuToggle) {
    menuToggle.setAttribute("aria-expanded", "false");
  }

  document.body.classList.remove("sidebar-open");
}

if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    const isOpen =
      adminSidebar?.classList.contains("active");

    if (isOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener("click", closeSidebar);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSidebar();
  }
});


/* =========================================================
   SIDEBAR NAVIGATION
========================================================= */

const navigationLinks = document.querySelectorAll(
  "[data-page]"
);

const implementedPages = new Set([
  "dashboard"
]);

navigationLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();

    const pageName = link.dataset.page;

    closeSidebar();

    if (!currentAdmin) {
      showLoginScreen();
      return;
    }

    if (pageName === "dashboard") {
      document.querySelectorAll("[data-page]").forEach((item) => {
        item.classList.toggle(
          "active",
          item.dataset.page === "dashboard"
        );
      });

      const dashboardPage = $("#dashboardPage");

      if (dashboardPage) {
        dashboardPage.hidden = false;
        dashboardPage.style.display = "";
      }

      loadDashboardStatistics();
      return;
    }

    if (!implementedPages.has(pageName)) {
      showNotification(
        `${formatPageName(pageName)} page will be implemented in the next step.`,
        "info"
      );

      return;
    }
  });
});

function formatPageName(name = "") {
  return name
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}


/* =========================================================
   DASHBOARD QUICK ACTIONS
========================================================= */

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!currentAdmin) {
      showLoginScreen();
      return;
    }

    const action = button.dataset.action;

    showNotification(
      `${formatPageName(action)} will be connected when its page is implemented.`,
      "info"
    );
  });
});


/* =========================================================
   REFRESH DASHBOARD
========================================================= */

if (refreshDashboardButton) {
  refreshDashboardButton.addEventListener("click", async () => {
    if (!currentAdmin) return;

    await loadDashboardStatistics();

    showNotification(
      "Dashboard refresh completed.",
      "success"
    );
  });
}


/* =========================================================
   VIEW ALL CONTENT
========================================================= */

const viewAllContentButton = $("#viewAllContentButton");

if (viewAllContentButton) {
  viewAllContentButton.addEventListener("click", () => {
    showNotification(
      "The complete content list will be implemented in the next step.",
      "info"
    );
  });
}


/* =========================================================
   INITIALIZE APPLICATION
========================================================= */

initializeUI();
