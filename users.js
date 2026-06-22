/* ═══════════════════════════════════════════
   users.js — Менеджер облікових записів
   Авторизація: повністю через Firebase Auth
   Дані: повністю через Firestore (firebase.js)
══════════════════════════════════════════ */

const Users = {

  // Порожній ST для нового користувача
  emptyST(){
    return {
      accounts:[],
      transactions:[],
      assets:[],
      events:{},
      exchangeRates:{},
      categories:[],
      categoriesNew:[]
    };
  },

  // ═══ LEGACY DATA MIGRATION (з localStorage) ═══
  hasLegacyData(){
    return !!localStorage.getItem('ft3');
  },
  getLegacyData(){
    try{ return JSON.parse(localStorage.getItem('ft3')||'{}'); }catch(e){ return null; }
  },
  removeLegacyData(){
    localStorage.removeItem('ft3');
  },

  // Чи є активний користувач
  isLoggedIn(){
    return !!Firebase.getCurrentUser();
  },

  // Поточний користувач (об'єкт Firebase Auth: .email, .uid, ...)
  activeUser(){
    return Firebase.getCurrentUser();
  },

  // Завантажити дані користувача з Firestore, якщо немає — створити порожні
  async loadOrCreateData(){
    let data;
    try{
      data = await Firebase.getCurrentUserData();
    }catch(e){
      // Помилка читання (мережа/таймінг) — НЕ перезаписуємо дані порожніми!
      console.error('[Users] Не вдалося завантажити дані з Firestore:', e.message);
      return null;
    }

    if(data === null){
      // Документ СПРАВДІ не існує — це новий користувач
      data = this.emptyST();
      await Firebase.saveCurrentUserData(data);
      console.log('[Users] Створено новий документ даних для користувача');
    }
    window.ST = data;
    return data;
  },

  // Реєстрація (email/password)
  async create(email, password){
    if(!email || !email.includes('@')){
      return {ok:false, error:'Email має містити символ @'};
    }
    if(!password || password.length < 6){
      return {ok:false, error:'Пароль має бути не менше 6 символів'};
    }
    const res = await Firebase.registerWithEmail(email, password);
    if(!res.success){
      return {ok:false, error: this._translateAuthError(res.error)};
    }
    await this.loadOrCreateData();
    return {ok:true};
  },

  // Вхід (email/password)
  async login(email, password){
    const res = await Firebase.loginWithEmail(email, password);
    if(!res.success){
      return {ok:false, error: this._translateAuthError(res.error)};
    }
    await this.loadOrCreateData();
    return {ok:true};
  },

  // Вхід через Google
  async loginGoogle(){
    const res = await Firebase.loginWithGoogle();
    if(!res.success){
      return {ok:false, error: this._translateAuthError(res.error)};
    }
    await this.loadOrCreateData();
    return {ok:true};
  },

  // Вийти
  async logout(){
    await Firebase.logout();
    window.ST = null;
  },

  // Зберегти поточний ST у Firestore (викликати після кожної зміни даних)
  async save(data){
  if(!data) return false;
  return await Firebase.saveCurrentUserData(data);
  },

  // Змінити пароль (працює тільки для email/password акаунтів)
  async changePassword(newPassword){
    const user = Firebase.getCurrentUser();
    if(!user) return {ok:false, error:'Не авторизовано'};
    try{
      await user.updatePassword(newPassword);
      return {ok:true};
    }catch(e){
      return {ok:false, error: this._translateAuthError(e.message)};
    }
  },

  // Видалити обліковий запис повністю (дані + сам акаунт у Firebase Auth)
  async deleteAccount(){
    const user = Firebase.getCurrentUser();
    if(!user) return {ok:false, error:'Не авторизовано'};
    await Firebase.deleteCurrentUserData();
    try{
      await user.delete();
    }catch(e){
      console.warn('[Users] Не вдалося видалити Auth-акаунт:', e.message);
    }
    window.ST = null;
    return {ok:true};
  },

  // Людяні повідомлення про помилки Firebase Auth
  _translateAuthError(msg){
    if(!msg) return 'Невідома помилка';
    // Сучасний Firebase (з увімкненим Email Enumeration Protection) повертає
    // єдиний код invalid-credential і для невірного email, і для невірного пароля —
    // окремі user-not-found/wrong-password більше не приходять у цьому випадку.
    if(msg.includes('invalid-credential')) return 'Невірний email або пароль';
    if(msg.includes('user-not-found')) return 'Користувача не знайдено';
    if(msg.includes('wrong-password')) return 'Невірний пароль';
    if(msg.includes('email-already-in-use')) return 'Email вже зареєстрований';
    if(msg.includes('invalid-email')) return 'Невірний формат email';
    if(msg.includes('weak-password')) return 'Пароль занадто простий';
    if(msg.includes('user-disabled')) return 'Цей акаунт вимкнено';
    if(msg.includes('too-many-requests')) return 'Забагато спроб. Спробуйте пізніше';
    if(msg.includes('network-request-failed')) return 'Немає з\'єднання з мережею';
    if(msg.includes('popup-closed-by-user')) return 'Вікно входу закрито';
    return msg;
  }

};