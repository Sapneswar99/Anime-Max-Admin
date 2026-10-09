/* =====================================================
   ANIME MAX ADMIN — SHARED LOGIC
===================================================== */

(function () {
    'use strict';

    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyCpfrluxsBhnz48ve9RykIy1IxzbBfk7dA",
        authDomain: "sm-studio-7.firebaseapp.com",
        databaseURL: "https://sm-studio-7-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "sm-studio-7",
        storageBucket: "sm-studio-7.firebasestorage.app",
        messagingSenderId: "126291501472",
        appId: "1:126291501472:web:a55c94b5b87581177204c5"
    };

    const ADMIN_EMAIL = 'admin@animemax.com';

    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);

    const auth    = firebase.auth();
    const db      = firebase.database();
    const storage = firebase.storage ? firebase.storage() : null;

    /* ----------------------------------
       AUTH GUARD
       Redirect to login if not authenticated
    ---------------------------------- */
    function guard() {
        return new Promise((resolve) => {
            auth.onAuthStateChanged((user) => {
                if (!user || user.email !== ADMIN_EMAIL) {
                    window.location.href = 'index.html';
                    return;
                }
                const userEl = document.getElementById('userEmail');
                if (userEl) userEl.textContent = user.email;
                resolve(user);
            });
        });
    }

    /* ----------------------------------
       LOGOUT
    ---------------------------------- */
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('logoutBtn');
        if (btn) {
            btn.addEventListener('click', () => {
                auth.signOut().then(() => {
                    window.location.href = 'index.html';
                });
            });
        }

        // Highlight current nav
        const page = window.location.pathname.split('/').pop() || 'dashboard.html';
        document.querySelectorAll('.nav-item').forEach(item => {
            const href = item.getAttribute('href');
            if (href === page) item.classList.add('active');
        });
    });

    /* ----------------------------------
       HELPERS
    ---------------------------------- */
    function slugify(text) {
        return String(text).toLowerCase().trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function escapeHTML(str) {
        return String(str ?? '').replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    }

    function capitalize(str) {
        return String(str).charAt(0).toUpperCase() + String(str).slice(1);
    }

    function showMsg(el, text, isError) {
        if (!el) return;
        el.textContent = text;
        el.classList.toggle('error', !!isError);
        if (text) {
            setTimeout(() => {
                el.textContent = '';
                el.classList.remove('error');
            }, 4000);
        }
    }

    function getQueryParam(name) {
        return new URLSearchParams(window.location.search).get(name) || '';
    }

    async function uploadFile(file, path, onProgress) {
        if (!storage) throw new Error('Storage not initialized');
        return new Promise((resolve, reject) => {
            const ref = storage.ref(path);
            const task = ref.put(file);
            task.on('state_changed',
                (snap) => {
                    if (onProgress) {
                        const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
                        onProgress(pct);
                    }
                },
                reject,
                async () => {
                    const url = await task.snapshot.ref.getDownloadURL();
                    resolve(url);
                }
            );
        });
    }

    /* ----------------------------------
       EXPOSE GLOBALLY
    ---------------------------------- */
    window.AnimeMaxAdmin = {
        auth,
        db,
        storage,
        ADMIN_EMAIL,
        guard,
        slugify,
        escapeHTML,
        capitalize,
        showMsg,
        getQueryParam,
        uploadFile
    };
})();
