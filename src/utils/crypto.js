const crypto = require('crypto');
const dotenv = require('dotenv');
dotenv.config();

// Standard 256-bit encryption key derivation
// Fallback key is generated dynamically or using a local static fallback
const MASTER_SECRET = process.env.ENCRYPTION_KEY || 'DraftlySecretSalt32BytesFallback!';
const ALGORITHM = 'aes-256-cbc';

// Derive a 32-byte key from our MASTER_SECRET
function getDerivedKey() {
  return crypto.createHash('sha256').update(MASTER_SECRET).digest();
}

/**
 * Encrypt a string value
 * @param {string} text Plain text to encrypt
 * @returns {string} Encrypted text in format iv:encryptedData
 */
function encrypt(text) {
  if (!text) return '';
  try {
    const iv = crypto.randomBytes(16);
    const key = getDerivedKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (err) {
    console.error('Encryption error:', err);
    return text; // Return unencrypted as emergency fallback
  }
}

/**
 * Decrypt an encrypted string
 * @param {string} cipherText Encrypted string in format iv:encryptedData
 * @returns {string} Decrypted plain text
 */
function decrypt(cipherText) {
  if (!cipherText) return '';
  if (!cipherText.includes(':')) return cipherText; // Return as-is if not in cipher format
  
  try {
    const parts = cipherText.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const key = getDerivedKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption error:', err);
    // If decryption fails, return the original cipher text (or part of it)
    return cipherText;
  }
}

module.exports = {
  encrypt,
  decrypt
};
