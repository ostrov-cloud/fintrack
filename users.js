/* ═══════════════════════════════════════════
   users.js — Менеджер облікових записів
   Авторизація: Firebase Auth
   Шифрування: PIN → PBKDF2(KEK) → DEK → AES-GCM(ST)
   Локальний бекап: зашифрований blob у localStorage
══════════════════════════════════════════ */

const Users = {
  _dek: null, // CryptoKey — тільки в пам'яті, очищається при logout

  emptyST() {
    return {
      accounts: [],
      transactions: [],
      assets: [],
      events: {},
      exchangeRates: {},
      categories: [],
      categoriesNew: []
    };
  },

  // ═══ LEGACY (міграція зі старого localStorage) ═══
  hasLegacyData() { return !!localStorage.getItem('ft3'); },
  getLegacyData() {
    try { return JSON.parse(localStorage.getItem('ft3') || '{}'); } catch(e) { return null; }
  },
  removeLegacyData() { localStorage.removeItem('ft3'); },

  isLoggedIn() { return !!Firebase.getCurrentUser(); },
  activeUser() { return Firebase.getCurrentUser(); },

  // ═══ PIN: перша установка ═══
  // existingData — дані для міграції (якщо є незашифровані legacy-дані)
  async setupPIN(pin, existingData) {
    if (!pin || pin.length < 4) return { ok: false, error: 'PIN має бути не менше 4 символів' };

    const salt = Crypto.generateSalt();
    const kek  = await Crypto.deriveKey(pin, salt);
    const dekBytes = Crypto.generateDEK();
    const encryptedDEK = await Crypto.encryptDEK(dekBytes, kek);

    this._dek = await Crypto.importDEK(dekBytes);

    const data = existingData || this.emptyST();
    const encryptedData = await Crypto.encryptObject(data, this._dek);

    const payload = {
      _encrypted: true,
      _pinSalt: Crypto.bytesToBase64(salt),
      _encryptedDEK: encryptedDEK,
      _data: encryptedData
    };

    const ok = await Firebase.saveCurrentUserData(payload);
    if (ok) this._saveLocalBackup(payload);
    return { ok };
  },

  // ═══ PIN: розблокування при вході ═══
  async unlockWithPIN(pin) {
    // Спочатку пробуємо Firestore, при помилці — локальний бекап
    let userData;
    try {
      userData = await Firebase.getCurrentUserData();
    } catch(e) {
      console.warn('[Users] Firestore недоступний, пробуємо локальний бекап');
      userData = this._loadLatestBackup();
    }

    if (!userData || !userData._pinSalt || !userData._encryptedDEK) {
      return { ok: false, error: 'Метадані шифрування не знайдено' };
    }

    // Виводимо KEK і розшифровуємо DEK (AES-GCM автоматично верифікує PIN)
    try {
      const salt    = Crypto.base64ToBytes(userData._pinSalt);
      const kek     = await Crypto.deriveKey(pin, salt);
      const dekBytes = await Crypto.decryptDEK(userData._encryptedDEK, kek);
      this._dek = await Crypto.importDEK(dekBytes);
    } catch(e) {
      return { ok: false, error: 'Невірний PIN' };
    }

    // Розшифровуємо дані
    try {
      const data = await Crypto.decryptObject(userData._data, this._dek);
      window.ST = data;
      return { ok: true, data };
    } catch(e) {
      this._dek = null;
      return { ok: false, error: 'Помилка розшифрування даних' };
    }
  },

  // ═══ ЗАВАНТАЖЕННЯ / ІНІЦІАЛІЗАЦІЯ ═══
  async loadOrCreateData() {
    let userData;
    try {
      userData = await Firebase.getCurrentUserData();
    } catch(e) {
      console.error('[Users] Не вдалося завантажити дані:', e.message);
      return null;
    }

    // Новий користувач — документа ще немає
    if (userData === null) {
      return { _needsPINSetup: true, _legacyData: null };
    }

    // Зашифровані дані → потрібен PIN (або вже введений)
    if (userData._encrypted) {
      if (!this._dek) return { _needsPIN: true };
      try {
        const data = await Crypto.decryptObject(userData._data, this._dek);
        window.ST = data;
        return data;
      } catch(e) {
        this._dek = null;
        return { _needsPIN: true };
      }
    }

    // Незашифровані legacy-дані → пропонуємо встановити PIN і зашифрувати
    return { _needsPINSetup: true, _legacyData: userData };
  },

  // ═══ ЗБЕРЕЖЕННЯ (завжди зашифровано) ═══
  async save(data) {
    if (!data) return false;
    if (!this._dek) {
      console.warn('[Users] DEK відсутній — збереження заблоковано');
      return false;
    }

    // Зберігаємо _pinSalt та _encryptedDEK з Firestore (не перезаписуємо їх)
    let meta = {};
    try {
      const existing = await Firebase.getCurrentUserData();
      if (existing && existing._pinSalt) {
        meta = {
          _encrypted: true,
          _pinSalt: existing._pinSalt,
          _encryptedDEK: existing._encryptedDEK
        };
      }
    } catch(e) {}

    const encryptedData = await Crypto.encryptObject(data, this._dek);
    const payload = { ...meta, _data: encryptedData };

    const ok = await Firebase.saveCurrentUserData(payload);
    if (ok) this._saveLocalBackup(payload);
    return ok;
  },

  // ═══ ЛОКАЛЬНІ БЕКАПИ (зашифровані) ═══
  _BACKUP_KEY: 'ft3_enc_backups',
  _BACKUP_MAX: 10,

  _saveLocalBackup(payload) {
    try {
      const list = this._getBackupList();
      list.unshift({ ts: Date.now(), payload });
      if (list.length > this._BACKUP_MAX) list.splice(this._BACKUP_MAX);
      localStorage.setItem(this._BACKUP_KEY, JSON.stringify(list));
    } catch(e) {
      console.warn('[Backup] Помилка збереження:', e.message);
    }
  },

  _loadLatestBackup() {
    const list = this._getBackupList();
    return list.length ? list[0].payload : null;
  },

  _getBackupList() {
    try { return JSON.parse(localStorage.getItem(this._BACKUP_KEY) || '[]'); }
    catch(e) { return []; }
  },

  getLocalBackups() {
    return this._getBackupList().map((b, i) => ({
      index: i,
      ts: b.ts,
      label: new Date(b.ts).toLocaleString('uk-UA', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    }));
  },

  async restoreLocalBackup(index) {
    if (!this._dek) return { ok: false, error: 'Потрібен PIN для відновлення' };
    const list = this._getBackupList();
    if (index >= list.length) return { ok: false, error: 'Бекап не знайдено' };
    try {
      const data = await Crypto.decryptObject(list[index].payload._data, this._dek);
      window.ST = data;
      await this.save(data);
      return { ok: true, data };
    } catch(e) {
      return { ok: false, error: 'Помилка відновлення: ' + e.message };
    }
  },

  // ═══ AUTH ═══
  async create(email, password) {
    if (!email || !email.includes('@')) return { ok: false, error: 'Email має містити символ @' };
    if (!password || password.length < 6) return { ok: false, error: 'Пароль має бути не менше 6 символів' };
    const res = await Firebase.registerWithEmail(email, password);
    if (!res.success) return { ok: false, error: this._translateAuthError(res.error) };
    return { ok: true };
  },

  async login(email, password) {
    const res = await Firebase.loginWithEmail(email, password);
    if (!res.success) return { ok: false, error: this._translateAuthError(res.error) };
    return { ok: true };
  },

  async loginGoogle() {
    const res = await Firebase.loginWithGoogle();
    if (!res.success) return { ok: false, error: this._translateAuthError(res.error) };
    return { ok: true };
  },

  async logout() {
    this._dek = null;
    await Firebase.logout();
    window.ST = null;
  },

  async changePassword(newPassword) {
    const user = Firebase.getCurrentUser();
    if (!user) return { ok: false, error: 'Не авторизовано' };
    try {
      await user.updatePassword(newPassword);
      return { ok: true };
    } catch(e) {
      return { ok: false, error: this._translateAuthError(e.message) };
    }
  },

  async deleteAccount() {
    const user = Firebase.getCurrentUser();
    if (!user) return { ok: false, error: 'Не авторизовано' };
    await Firebase.deleteCurrentUserData();
    try { await user.delete(); } catch(e) {}
    this._dek = null;
    window.ST = null;
    return { ok: true };
  },

  _translateAuthError(msg) {
    if (!msg) return 'Невідома помилка';
    if (msg.includes('invalid-credential')) return 'Невірний email або пароль';
    if (msg.includes('user-not-found'))      return 'Користувача не знайдено';
    if (msg.includes('wrong-password'))      return 'Невірний пароль';
    if (msg.includes('email-already-in-use'))return 'Email вже зареєстрований';
    if (msg.includes('invalid-email'))       return 'Невірний формат email';
    if (msg.includes('weak-password'))       return 'Пароль занадто простий';
    if (msg.includes('user-disabled'))       return 'Цей акаунт вимкнено';
    if (msg.includes('too-many-requests'))   return 'Забагато спроб. Спробуйте пізніше';
    if (msg.includes('network-request-failed')) return 'Немає з\'єднання з мережею';
    if (msg.includes('popup-closed-by-user'))return 'Вікно входу закрито';
    return msg;
  }
};
