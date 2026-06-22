/* ═══════════════════════════════════════════
   crypto.js — Web Crypto API шифрування
   PBKDF2 + AES-GCM, дворівнева схема:
   PIN → KEK → DEK → дані
═══════════════════════════════════════════ */

const Crypto = {
  PBKDF2_ITERATIONS: 150000,
  KEY_LENGTH: 256,
  SALT_LENGTH: 16,
  IV_LENGTH: 12,

  // Випадкова сіль (16 байт)
  generateSalt() {
    return crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
  },

  // Випадковий DEK (32 байти)
  generateDEK() {
    return crypto.getRandomValues(new Uint8Array(32));
  },

  // PIN + сіль → KEK (CryptoKey, AES-GCM)
  async deriveKey(pin, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: this.PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: this.KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  },

  // Байти → CryptoKey (для DEK після розшифрування)
  async importDEK(dekBytes) {
    return crypto.subtle.importKey(
      'raw', dekBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
    );
  },

  // Шифрування рядка довільним ключем
  async encrypt(plaintext, key) {
    const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, enc.encode(plaintext)
    );
    return {
      iv: this.bytesToBase64(iv),
      ciphertext: this.bytesToBase64(new Uint8Array(ciphertext))
    };
  },

  // Розшифрування
  async decrypt(encrypted, key) {
    const iv = this.base64ToBytes(encrypted.iv);
    const ciphertext = this.base64ToBytes(encrypted.ciphertext);
    const dec = new TextDecoder();
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, key, ciphertext
    );
    return dec.decode(plainBuffer);
  },

  // Шифрує об'єкт
  async encryptObject(obj, key) {
    return this.encrypt(JSON.stringify(obj), key);
  },

  // Розшифровує об'єкт
  async decryptObject(encrypted, key) {
    const json = await this.decrypt(encrypted, key);
    return JSON.parse(json);
  },

  // Шифрує DEK (байти) ключем KEK → зберігається у Firestore
  async encryptDEK(dekBytes, kek) {
    const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, kek, dekBytes
    );
    return {
      iv: this.bytesToBase64(iv),
      ciphertext: this.bytesToBase64(new Uint8Array(ciphertext))
    };
  },

  // Розшифровує DEK → повертає Uint8Array
  async decryptDEK(encryptedDEK, kek) {
    const iv = this.base64ToBytes(encryptedDEK.iv);
    const ciphertext = this.base64ToBytes(encryptedDEK.ciphertext);
    const dekBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, kek, ciphertext
    );
    return new Uint8Array(dekBuffer);
  },

  bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  },

  base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
};
