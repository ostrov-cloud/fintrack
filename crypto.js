/* ═══════════════════════════════════════════
   crypto.js — Web Crypto API шифрування
   PBKDF2 + AES-GCM для облікових записів
═══════════════════════════════════════════ */

const Crypto={
  // Налаштування
  PBKDF2_ITERATIONS:150000,
  KEY_LENGTH:256,
  SALT_LENGTH:16,
  IV_LENGTH:12,

  // Генерація випадкової солі (16 байт)
  generateSalt(){
    return crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
  },

  // PBKDF2: пароль + сіль → AES-GCM ключ
  async deriveKey(password,salt){
    const enc=new TextEncoder();
    const keyMaterial=await crypto.subtle.importKey(
      'raw',enc.encode(password),'PBKDF2',false,['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {name:'PBKDF2',salt:salt,iterations:this.PBKDF2_ITERATIONS,hash:'SHA-256'},
      keyMaterial,
      {name:'AES-GCM',length:this.KEY_LENGTH},
      false,
      ['encrypt','decrypt']
    );
  },

  // Шифрування JSON-даних
  async encrypt(plaintext,key){
    const iv=crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
    const enc=new TextEncoder();
    const ciphertext=await crypto.subtle.encrypt(
      {name:'AES-GCM',iv:iv},
      key,
      enc.encode(plaintext)
    );
    return {
      iv:this.bytesToBase64(iv),
      ciphertext:this.bytesToBase64(new Uint8Array(ciphertext))
    };
  },

  // Розшифрування
  async decrypt(encrypted,key){
    const iv=this.base64ToBytes(encrypted.iv);
    const ciphertext=this.base64ToBytes(encrypted.ciphertext);
    const dec=new TextDecoder();
    const plainBuffer=await crypto.subtle.decrypt(
      {name:'AES-GCM',iv:iv},
      key,
      ciphertext
    );
    return dec.decode(plainBuffer);
  },

  // Шифрує об'єкт (автоматичний JSON.stringify)
  async encryptObject(obj,key){
    return this.encrypt(JSON.stringify(obj),key);
  },

  // Розшифровує об'єкт (автоматичний JSON.parse)
  async decryptObject(encrypted,key){
    const json=await this.decrypt(encrypted,key);
    return JSON.parse(json);
  },

  // Допоміжні: base64 ↔ Uint8Array
  bytesToBase64(bytes){
    let binary='';
    for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
    return btoa(binary);
  },

  base64ToBytes(base64){
    const binary=atob(base64);
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return bytes;
  }
};