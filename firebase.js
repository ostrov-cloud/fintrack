/* ═══════════════════════════════════════════
   firebase.js — Firebase Cloud Firestore sync
   ══════════════════════════════════════════ */
const Firebase = (() => {
  const config = {
    apiKey: "AIzaSyDbF2jYClIpck15kpyGvU3PPIMiw1L0gKI",
    authDomain: "fintrack-37853.firebaseapp.com",
    databaseURL: "https://fintrack-37853-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "fintrack-37853",
    storageBucket: "fintrack-37853.firebasestorage.app",
    messagingSenderId: "516398506549",
    appId: "1:516398506549:web:1329a98d8ef9c274fcc77c",
    measurementId: "G-ZY5LLPXZD8"
  };

  let _db = null;
  let _auth = null;
  let _ready = false;
  let _currentUser = null;
  let _persistenceEnabled = false;

  async function init() {
    if (_ready) return true;
    try {
      if (typeof firebase === 'undefined') {
        console.warn('[Firebase] SDK not loaded, using localStorage fallback');
        return false;
      }
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      _db = firebase.firestore();
      }

      _auth = firebase.auth();

      // Слідкуємо за станом авторизації
      _auth.onAuthStateChanged((user) => {
        _currentUser = user;
        if (user) {
          console.log('[Firebase] Авторизовано:', user.email || user.uid);
        } else {
          console.log('[Firebase] Не авторизовано');
        }
      });

      _ready = true;
      console.log('[Firebase] Initialized');
      return true;
    } catch (e) {
      console.warn('[Firebase] Init error (offline?):', e.message);
      return false;
    }
  }

  async function isReady() { return _ready; }

  function getCurrentUser() {
    return _currentUser;
  }

  // Чекаємо, поки Firebase визначить, авторизований користувач чи ні
  // (корисно при першому завантаженні сторінки)
  function waitForAuthInit() {
    return new Promise((resolve) => {
      if (!_auth) { resolve(null); return; }
      const unsub = _auth.onAuthStateChanged((user) => {
        unsub();
        resolve(user);
      });
    });
  }

  // ═══ AUTH: GOOGLE ═══

  async function loginWithGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const result = await _auth.signInWithPopup(provider);
      _currentUser = result.user; // Оновлюємо синхронно, не чекаємо onAuthStateChanged
      console.log('[Firebase] Google login OK:', result.user.email);
      return { success: true, user: result.user };
    } catch (e) {
      console.warn('[Firebase] Google login error:', e.message);
      return { success: false, error: e.message };
    }
  }

  // ═══ AUTH: EMAIL/PASSWORD ═══

  async function loginWithEmail(email, password) {
    try {
      const result = await _auth.signInWithEmailAndPassword(email, password);
      _currentUser = result.user; // Оновлюємо синхронно, не чекаємо onAuthStateChanged
      console.log('[Firebase] Email login OK:', result.user.email);
      return { success: true, user: result.user };
    } catch (e) {
      console.warn('[Firebase] Email login error:', e.message);
      return { success: false, error: e.message };
    }
  }

  async function registerWithEmail(email, password) {
    try {
      const result = await _auth.createUserWithEmailAndPassword(email, password);
      _currentUser = result.user; // Оновлюємо синхронно, не чекаємо onAuthStateChanged
      console.log('[Firebase] Реєстрація OK:', result.user.email);
      return { success: true, user: result.user };
    } catch (e) {
      console.warn('[Firebase] Помилка реєстрації:', e.message);
      return { success: false, error: e.message };
    }
  }

  async function logout() {
    try {
      await _auth.signOut();
      _currentUser = null;
      console.log('[Firebase] Вихід виконано');
      return true;
    } catch (e) {
      console.warn('[Firebase] Logout error:', e.message);
      return false;
    }
  }

  // ═══ USER DOCUMENT (тільки власний, по uid) ═══

  // Отримати дані ТІЛЬКИ поточного користувача
  async function getCurrentUserData(retries = 2) {
    if (!_ready || !_currentUser) {
      console.warn('[Firebase] getCurrentUserData skipped: не готово/не авторизовано');
      return undefined;
    }
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log('[Firebase] Fetching own data from Firestore... (спроба', attempt + 1, ')');
        const doc = await _db.collection('users').doc(_currentUser.uid).get();
        return doc.exists ? doc.data() : null;
      } catch (e) {
        console.warn(`[Firebase] getCurrentUserData помилка (спроба ${attempt + 1}):`, e.message);
        if (attempt === retries) {
          throw e;
        }
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  // Зберегти/оновити дані ТІЛЬКИ поточного користувача
  async function saveCurrentUserData(userData) {
    if (!_ready || !_currentUser) {
      console.warn('[Firebase] saveCurrentUserData skipped: не готово/не авторизовано');
      return false;
    }
    try {
      console.log('[Firebase] Saving own data:', _currentUser.uid);
      await _db.collection('users').doc(_currentUser.uid).set(userData, { merge: true });
      console.log('[Firebase] Дані збережено OK');
      return true;
    } catch (e) {
      console.warn('[Firebase] saveCurrentUserData error:', e.message);
      return false;
    }
  }

  // Видалити дані ТІЛЬКИ поточного користувача
  async function deleteCurrentUserData() {
    if (!_ready || !_currentUser) {
      console.warn('[Firebase] deleteCurrentUserData skipped: не готово/не авторизовано');
      return false;
    }
    try {
      await _db.collection('users').doc(_currentUser.uid).delete();
      console.log('[Firebase] Дані видалено');
      return true;
    } catch (e) {
      console.warn('[Firebase] deleteCurrentUserData error:', e.message);
      return false;
    }
  }

  function isPersistenceEnabled() { return _persistenceEnabled; }

  return {
    init, isReady, getCurrentUser, waitForAuthInit, isPersistenceEnabled,
    loginWithGoogle, loginWithEmail, registerWithEmail, logout,
    getCurrentUserData, saveCurrentUserData, deleteCurrentUserData
  };
})();