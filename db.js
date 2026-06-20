/* ═══════════════════════════════════════════
   db.js — SQLite Data Access Layer для FinTrack
   Використовує @capacitor-community/sqlite
   ═══════════════════════════════════════════ */

const DB = (() => {
  // Приватні змінні
  let _db = null;
  let _ready = false;
  const DB_NAME = 'fintrack';

  // Отримати посилання на плагін
  function _getPlugin() {
    // Пробуємо різні шляхи доступу до плагіна Capacitor SQLite
    if (window.CapacitorSQLite) return window.CapacitorSQLite;
    if (window.Capacitor?.Plugins?.CapacitorSQLite) return window.Capacitor.Plugins.CapacitorSQLite;
    throw new Error('CapacitorSQLite plugin not found');
  }

  // Генерація унікального ID
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  /* ═══════════════════════════════════════════
     ІНІЦІАЛІЗАЦІЯ
  ═══════════════════════════════════════════ */

  async function init() {
    if (_ready) return true;

    try {
      const plugin = _getPlugin();

      // Створюємо з'єднання
      _db = await plugin.createConnection(DB_NAME, false, 'no-encryption', 1);

      // Відкриваємо базу
      await _db.open();

      // Створюємо таблиці, якщо їх ще немає
      await _createTables();

      _ready = true;
      console.log('[DB] SQLite initialized successfully');
      return true;
    } catch (e) {
      console.error('[DB] Init error:', e);
      // Якщо SQLite не доступний (наприклад, у браузері) — використовуємо localStorage як fallback
      _ready = false;
      return false;
    }
  }

  async function isReady() {
    return _ready;
  }

  /* ═══════════════════════════════════════════
     СТВОРЕННЯ ТАБЛИЦЬ
  ═══════════════════════════════════════════ */

  async function _createTables() {
    const sql = `
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        balance REAL DEFAULT 0,
        currency TEXT DEFAULT 'UAH',
        icon TEXT DEFAULT 'ti-credit-card',
        emoji TEXT DEFAULT '',
        color TEXT DEFAULT '#534AB7',
        type TEXT DEFAULT 'checking',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        from_account TEXT DEFAULT '',
        to_account TEXT DEFAULT '',
        category TEXT DEFAULT '',
        description TEXT DEFAULT '',
        date TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        value REAL DEFAULT 0,
        currency TEXT DEFAULT 'UAH',
        icon TEXT DEFAULT '',
        emoji TEXT DEFAULT '',
        color TEXT DEFAULT '#534AB7',
        description TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        amount REAL DEFAULT 0,
        currency TEXT DEFAULT 'UAH',
        account_id TEXT DEFAULT '',
        category TEXT DEFAULT '',
        description TEXT DEFAULT '',
        date TEXT NOT NULL,
        repeat TEXT DEFAULT 'once',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS exchange_rates (
        currency TEXT NOT NULL,
        date TEXT NOT NULL,
        rate REAL NOT NULL,
        PRIMARY KEY (currency, date)
      );

      CREATE TABLE IF NOT EXISTS categories (
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        PRIMARY KEY (type, name)
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `;

    await _db.execute(sql);

    // Миграция: добавляем колонку currency в events, если её ещё нет
    try { await _db.run('ALTER TABLE events ADD COLUMN currency TEXT DEFAULT \'UAH\''); } catch(e) { /* колонка уже существует */ }
  }

  /* ═══════════════════════════════════════════
     МІГРАЦІЯ З localStorage
  ═══════════════════════════════════════════ */

  async function migrateFromLocalStorage() {
    if (!_ready) return false;

    try {
      // Перевіряємо, чи вже виконана міграція
      const already = await getSetting('migrated_v1');
      if (already === 'true') {
        console.log('[DB] Migration already done, skipping');
        return true;
      }

      // Читаємо дані з localStorage
      const raw = localStorage.getItem('ft3');
      if (!raw) {
        console.log('[DB] No localStorage data to migrate');
        await setSetting('migrated_v1', 'true');
        return true;
      }

      const ST = JSON.parse(raw);
      console.log('[DB] Migrating from localStorage...');

      // Мігруємо accounts
      if (Array.isArray(ST.accounts)) {
        for (const acc of ST.accounts) {
          await _db.run(
            `INSERT OR IGNORE INTO accounts (id, name, balance, currency, icon, emoji, color, type, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [acc.id || genId(), acc.name, acc.balance || 0, acc.currency || 'UAH',
             acc.icon || 'ti-credit-card', acc.emoji || '', acc.color || '#534AB7',
             acc.type || 'checking', acc.created_at || new Date().toISOString()]
          );
        }
      }

      // Мігруємо transactions
      if (Array.isArray(ST.transactions)) {
        for (const txn of ST.transactions) {
          await _db.run(
            `INSERT OR IGNORE INTO transactions (id, type, amount, from_account, to_account, category, description, date, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [txn.id || genId(), txn.type, txn.amount || 0,
             txn.from || txn.from_account || '', txn.to || txn.to_account || '',
             txn.cat || txn.category || '', txn.desc || txn.description || '',
             txn.date, txn.created_at || new Date().toISOString()]
          );
        }
      }

      // Мігруємо assets
      if (Array.isArray(ST.assets)) {
        for (const a of ST.assets) {
          await _db.run(
            `INSERT OR IGNORE INTO assets (id, name, type, value, currency, icon, emoji, color, description, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [a.id || genId(), a.name, a.type || 'asset', a.value || 0,
             a.currency || 'UAH', a.icon || '', a.emoji || '', a.color || '#534AB7',
             a.desc || a.description || '', a.created_at || new Date().toISOString()]
          );
        }
      }

      // Мігруємо events
      if (Array.isArray(ST.events)) {
        for (const ev of ST.events) {
          await _db.run(
            `INSERT OR IGNORE INTO events (id, type, amount, currency, account_id, category, description, date, repeat, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ev.id || genId(), ev.type, ev.amount || 0, ev.currency || 'UAH',
             ev.account_id || ev.accId || '', ev.cat || ev.category || '',
             ev.desc || ev.description || '', ev.date,
             ev.repeat || 'once', ev.created_at || new Date().toISOString()]
          );
        }
      }

      // Мігруємо exchangeRates
      if (ST.exchangeRates && typeof ST.exchangeRates === 'object') {
        for (const [currency, rates] of Object.entries(ST.exchangeRates)) {
          if (typeof rates === 'object') {
            for (const [date, rate] of Object.entries(rates)) {
              if (typeof rate === 'number') {
                await _db.run(
                  `INSERT OR IGNORE INTO exchange_rates (currency, date, rate) VALUES (?, ?, ?)`,
                  [currency, date, rate]
                );
              }
            }
          }
        }
      }

      // Мігруємо categories
      if (ST.categories) {
        if (Array.isArray(ST.categories.expense)) {
          for (let i = 0; i < ST.categories.expense.length; i++) {
            await _db.run(
              `INSERT OR IGNORE INTO categories (type, name, sort_order) VALUES (?, ?, ?)`,
              ['expense', ST.categories.expense[i], i]
            );
          }
        }
        if (Array.isArray(ST.categories.income)) {
          for (let i = 0; i < ST.categories.income.length; i++) {
            await _db.run(
              `INSERT OR IGNORE INTO categories (type, name, sort_order) VALUES (?, ?, ?)`,
              ['income', ST.categories.income[i], i]
            );
          }
        }
      }

      // Мігруємо пароль
      const pwd = localStorage.getItem('ft3_pwd');
      if (pwd) {
        await setSetting('pwd_hash', pwd);
      }

      // Позначаємо міграцію як виконану
      await setSetting('migrated_v1', 'true');

      // Не видаляємо localStorage — залишаємо як ручний бекап
      console.log('[DB] Migration from localStorage completed successfully');
      return true;
    } catch (e) {
      console.error('[DB] Migration error:', e);
      return false;
    }
  }

  /* ═══════════════════════════════════════════
     ЗАВАНТАЖИТИ ВСЕ (для ініціалізації ST)
  ═══════════════════════════════════════════ */

  async function loadAll() {
    if (!_ready) return null;

    try {
      const [accounts, transactions, assets, events, rates, categories] = await Promise.all([
        loadAccounts(),
        loadTransactions(),
        loadAssets(),
        loadEvents(),
        loadRates(),
        loadCategories()
      ]);

      return {
        accounts,
        transactions,
        assets,
        events,
        exchangeRates: rates,
        categories,
        selAcc: null  // завжди скидається при завантаженні
      };
    } catch (e) {
      console.error('[DB] loadAll error:', e);
      return null;
    }
  }

  /* ═══════════════════════════════════════════
     ACCOUNTS
  ═══════════════════════════════════════════ */

  async function loadAccounts() {
    const res = await _db.query('SELECT * FROM accounts ORDER BY created_at');
    return res.values || [];
  }

  async function saveAccount(acc) {
    if (!acc.id) acc.id = genId();
    acc.created_at = acc.created_at || new Date().toISOString();
    await _db.run(
      `INSERT OR REPLACE INTO accounts (id, name, balance, currency, icon, emoji, color, type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [acc.id, acc.name, acc.balance || 0, acc.currency || 'UAH',
       acc.icon || 'ti-credit-card', acc.emoji || '', acc.color || '#534AB7',
       acc.type || 'checking', acc.created_at]
    );
    return acc;
  }

  async function updateAccountBalance(id, balance) {
    await _db.run('UPDATE accounts SET balance = ? WHERE id = ?', [balance, id]);
  }

  async function deleteAccount(id) {
    await _db.run('DELETE FROM accounts WHERE id = ?', [id]);
  }

  /* ═══════════════════════════════════════════
     TRANSACTIONS
  ═══════════════════════════════════════════ */

  async function loadTransactions() {
    const res = await _db.query('SELECT * FROM transactions ORDER BY date DESC, created_at DESC');
    return res.values || [];
  }

  async function saveTransaction(txn) {
    if (!txn.id) txn.id = genId();
    txn.created_at = txn.created_at || new Date().toISOString();
    await _db.run(
      `INSERT OR REPLACE INTO transactions (id, type, amount, from_account, to_account, category, description, date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [txn.id, txn.type, txn.amount, txn.from || txn.from_account || '',
       txn.to || txn.to_account || '', txn.cat || txn.category || '',
       txn.desc || txn.description || '', txn.date, txn.created_at]
    );
    return txn;
  }

  async function deleteTransaction(id) {
    await _db.run('DELETE FROM transactions WHERE id = ?', [id]);
  }

  /* ═══════════════════════════════════════════
     ASSETS
  ═══════════════════════════════════════════ */

  async function loadAssets() {
    const res = await _db.query('SELECT * FROM assets ORDER BY created_at');
    return res.values || [];
  }

  async function saveAsset(a) {
    if (!a.id) a.id = genId();
    a.created_at = a.created_at || new Date().toISOString();
    await _db.run(
      `INSERT OR REPLACE INTO assets (id, name, type, value, currency, icon, emoji, color, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.id, a.name, a.type || 'asset', a.value || 0,
       a.currency || 'UAH', a.icon || '', a.emoji || '', a.color || '#534AB7',
       a.desc || a.description || '', a.created_at]
    );
    return a;
  }

  async function deleteAsset(id) {
    await _db.run('DELETE FROM assets WHERE id = ?', [id]);
  }

  /* ═══════════════════════════════════════════
     EVENTS
  ═══════════════════════════════════════════ */

  async function loadEvents() {
    const res = await _db.query('SELECT * FROM events ORDER BY date, created_at');
    return res.values || [];
  }

  async function saveEvent(ev) {
    if (!ev.id) ev.id = genId();
    ev.created_at = ev.created_at || new Date().toISOString();
    await _db.run(
      `INSERT OR REPLACE INTO events (id, type, amount, currency, account_id, category, description, date, repeat, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ev.id, ev.type, ev.amount || 0, ev.currency || 'UAH',
       ev.account_id || ev.accId || '', ev.cat || ev.category || '',
       ev.desc || ev.description || '', ev.date,
       ev.repeat || 'once', ev.created_at]
    );
    return ev;
  }

  async function deleteEvent(id) {
    await _db.run('DELETE FROM events WHERE id = ?', [id]);
  }

  /* ═══════════════════════════════════════════
     EXCHANGE RATES
  ═══════════════════════════════════════════ */

  async function loadRates() {
    const res = await _db.query('SELECT * FROM exchange_rates');
    // Перетворюємо плоский список у вкладену структуру {currency: {date: rate}}
    const rates = {};
    if (res.values) {
      for (const row of res.values) {
        if (!rates[row.currency]) rates[row.currency] = {};
        rates[row.currency][row.date] = row.rate;
      }
    }
    return rates;
  }

  async function saveRate(currency, date, rate) {
    await _db.run(
      `INSERT OR REPLACE INTO exchange_rates (currency, date, rate) VALUES (?, ?, ?)`,
      [currency, date, rate]
    );
  }

  async function deleteOldRates(beforeDate) {
    await _db.run('DELETE FROM exchange_rates WHERE date < ?', [beforeDate]);
  }

  /* ═══════════════════════════════════════════
     CATEGORIES
  ═══════════════════════════════════════════ */

  async function loadCategories() {
    const res = await _db.query('SELECT * FROM categories ORDER BY type, sort_order');
    const cats = { expense: [], income: [] };
    if (res.values) {
      for (const row of res.values) {
        if (cats[row.type]) {
          cats[row.type].push(row.name);
        }
      }
    }
    // Якщо категорії порожні — повертаємо дефолтні
    if (cats.expense.length === 0) {
      cats.expense = ['🛒 Продукти','🏠 Житло','🚗 Транспорт','💊 Здоров\'я','🎬 Розваги','👗 Одяг','📚 Освіта','✈️ Подорожі','📦 Інше'];
    }
    if (cats.income.length === 0) {
      cats.income = ['💼 Зарплата','💰 Фріланс','📈 Інвестиції','🏠 Оренда','🎁 Подарунок','💵 Інше'];
    }
    return cats;
  }

  async function saveCategory(type, name) {
    await _db.run(
      `INSERT OR IGNORE INTO categories (type, name) VALUES (?, ?)`,
      [type, name]
    );
  }

  async function deleteCategory(type, name) {
    await _db.run('DELETE FROM categories WHERE type = ? AND name = ?', [type, name]);
  }

  /* ═══════════════════════════════════════════
     SETTINGS
  ═══════════════════════════════════════════ */

  async function getSetting(key) {
    const res = await _db.query('SELECT value FROM settings WHERE key = ?', [key]);
    if (res.values && res.values.length > 0) {
      return res.values[0].value;
    }
    return null;
  }

  async function setSetting(key, value) {
    await _db.run(
      `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
      [key, String(value)]
    );
  }

  async function deleteSetting(key) {
    await _db.run('DELETE FROM settings WHERE key = ?', [key]);
  }

  /* ═══════════════════════════════════════════
     ЕКСПОРТ / ІМПОРТ (JSON бекап)
  ═══════════════════════════════════════════ */

  async function exportToJSON() {
    const data = await loadAll();
    return JSON.stringify(data, null, 2);
  }

  async function importFromJSON(jsonStr) {
    if (!_ready) return false;
    try {
      const data = JSON.parse(jsonStr);

      // Очищаємо всі таблиці перед імпортом
      await _db.execute(`
        DELETE FROM transactions;
        DELETE FROM events;
        DELETE FROM assets;
        DELETE FROM exchange_rates;
        DELETE FROM categories;
        DELETE FROM accounts;
        DELETE FROM settings WHERE key != 'migrated_v1' AND key != 'pwd_hash';
      `);

      // Імпортуємо accounts
      if (Array.isArray(data.accounts)) {
        for (const acc of data.accounts) {
          await saveAccount(acc);
        }
      }

      // Імпортуємо transactions
      if (Array.isArray(data.transactions)) {
        for (const txn of data.transactions) {
          await saveTransaction(txn);
        }
      }

      // Імпортуємо assets
      if (Array.isArray(data.assets)) {
        for (const a of data.assets) {
          await saveAsset(a);
        }
      }

      // Імпортуємо events
      if (Array.isArray(data.events)) {
        for (const ev of data.events) {
          await saveEvent(ev);
        }
      }

      // Імпортуємо exchangeRates
      if (data.exchangeRates && typeof data.exchangeRates === 'object') {
        for (const [currency, rates] of Object.entries(data.exchangeRates)) {
          if (typeof rates === 'object') {
            for (const [date, rate] of Object.entries(rates)) {
              if (typeof rate === 'number') {
                await saveRate(currency, date, rate);
              }
            }
          }
        }
      }

      // Імпортуємо categories
      if (data.categories) {
        if (Array.isArray(data.categories.expense)) {
          for (const name of data.categories.expense) {
            await saveCategory('expense', name);
          }
        }
        if (Array.isArray(data.categories.income)) {
          for (const name of data.categories.income) {
            await saveCategory('income', name);
          }
        }
      }

      console.log('[DB] Import completed successfully');
      return true;
    } catch (e) {
      console.error('[DB] Import error:', e);
      return false;
    }
  }

  /* ═══════════════════════════════════════════
     SAVE ALL (повне збереження ST)
  ═══════════════════════════════════════════ */

  async function saveAll(ST) {
    if (!_ready) return false;
    try {
      await _db.execute(`
        DELETE FROM transactions;
        DELETE FROM events;
        DELETE FROM assets;
        DELETE FROM exchange_rates;
        DELETE FROM categories;
        DELETE FROM accounts;
      `);

      if (Array.isArray(ST.accounts)) {
        for (const acc of ST.accounts) {
          await _db.run(
            `INSERT INTO accounts (id, name, balance, currency, icon, emoji, color, type, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [acc.id || genId(), acc.name || '', acc.balance || 0, acc.currency || 'UAH',
             acc.icon || 'ti-credit-card', acc.emoji || '', acc.color || '#534AB7',
             acc.type || 'checking', acc.created_at || new Date().toISOString()]
          );
        }
      }

      if (Array.isArray(ST.transactions)) {
        for (const txn of ST.transactions) {
          await _db.run(
            `INSERT INTO transactions (id, type, amount, from_account, to_account, category, description, date, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [txn.id || genId(), txn.type || '', txn.amount || 0,
             txn.from || txn.from_account || '', txn.to || txn.to_account || '',
             txn.cat || txn.category || '', txn.desc || txn.description || '',
             txn.date || '', txn.created_at || new Date().toISOString()]
          );
        }
      }

      if (Array.isArray(ST.assets)) {
        for (const a of ST.assets) {
          await _db.run(
            `INSERT INTO assets (id, name, type, value, currency, icon, emoji, color, description, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [a.id || genId(), a.name || '', a.type || 'asset', a.value || 0,
             a.currency || 'UAH', a.icon || '', a.emoji || '', a.color || '#534AB7',
             a.desc || a.description || '', a.created_at || new Date().toISOString()]
          );
        }
      }

      if (Array.isArray(ST.events)) {
        for (const ev of ST.events) {
          await _db.run(
            `INSERT INTO events (id, type, amount, currency, account_id, category, description, date, repeat, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ev.id || genId(), ev.type || '', ev.amount || 0, ev.currency || 'UAH',
             ev.account_id || ev.accId || '', ev.cat || ev.category || '',
             ev.desc || ev.description || '', ev.date || '',
             ev.repeat || 'once', ev.created_at || new Date().toISOString()]
          );
        }
      }

      if (ST.exchangeRates && typeof ST.exchangeRates === 'object') {
        for (const [currency, rates] of Object.entries(ST.exchangeRates)) {
          if (typeof rates === 'object') {
            for (const [date, rate] of Object.entries(rates)) {
              if (typeof rate === 'number') {
                await _db.run(
                  `INSERT INTO exchange_rates (currency, date, rate) VALUES (?, ?, ?)`,
                  [currency, date, rate]
                );
              }
            }
          }
        }
      }

      if (ST.categories) {
        if (Array.isArray(ST.categories.expense)) {
          for (let i = 0; i < ST.categories.expense.length; i++) {
            await _db.run(
              `INSERT INTO categories (type, name, sort_order) VALUES (?, ?, ?)`,
              ['expense', ST.categories.expense[i], i]
            );
          }
        }
        if (Array.isArray(ST.categories.income)) {
          for (let i = 0; i < ST.categories.income.length; i++) {
            await _db.run(
              `INSERT INTO categories (type, name, sort_order) VALUES (?, ?, ?)`,
              ['income', ST.categories.income[i], i]
            );
          }
        }
      }

      return true;
    } catch (e) {
      console.error('[DB] saveAll error:', e);
      return false;
    }
  }

  /* ═══════════════════════════════════════════
     ПУБЛІЧНИЙ API
  ═══════════════════════════════════════════ */

  return {
    // Ініціалізація
    init,
    isReady,
    migrateFromLocalStorage,
    genId,

    // Завантаження всього
    loadAll,
    saveAll,

    // Accounts
    loadAccounts,
    saveAccount,
    updateAccountBalance,
    deleteAccount,

    // Transactions
    loadTransactions,
    saveTransaction,
    deleteTransaction,

    // Assets
    loadAssets,
    saveAsset,
    deleteAsset,

    // Events
    loadEvents,
    saveEvent,
    deleteEvent,

    // Exchange Rates
    loadRates,
    saveRate,
    deleteOldRates,

    // Categories
    loadCategories,
    saveCategory,
    deleteCategory,

    // Settings
    getSetting,
    setSetting,
    deleteSetting,

    // Export/Import
    exportToJSON,
    importFromJSON
  };
})();
