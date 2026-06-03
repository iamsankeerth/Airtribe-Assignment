const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const CURRENT_VERSION = 'v2';
const CURRENT_ALGORITHM = 'aes-256-gcm';
const LEGACY_ALGORITHM = 'aes-256-cbc';
const KEY_FILE_PATH = path.join(__dirname, '..', '..', 'data', '.draftly.key');
const LEGACY_FALLBACK_SECRET = 'DraftlySecretSalt32BytesFallback!';

let cachedSecret = null;

function ensureKeyDirectory() {
  const dataDir = path.dirname(KEY_FILE_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function resolveMasterSecret() {
  if (cachedSecret) {
    return cachedSecret;
  }

  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.trim()) {
    cachedSecret = process.env.ENCRYPTION_KEY.trim();
    return cachedSecret;
  }

  ensureKeyDirectory();

  if (fs.existsSync(KEY_FILE_PATH)) {
    cachedSecret = fs.readFileSync(KEY_FILE_PATH, 'utf8').trim();
    if (cachedSecret) {
      return cachedSecret;
    }
  }

  cachedSecret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(KEY_FILE_PATH, `${cachedSecret}\n`, { encoding: 'utf8', mode: 0o600 });
  return cachedSecret;
}

function getDerivedKey(secret = resolveMasterSecret()) {
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(text) {
  if (!text) return '';

  const iv = crypto.randomBytes(12);
  const key = getDerivedKey();
  const cipher = crypto.createCipheriv(CURRENT_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    CURRENT_VERSION,
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex')
  ].join(':');
}

function decryptLegacy(cipherText) {
  const parts = cipherText.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encryptedText = Buffer.from(parts.join(':'), 'hex');

  try {
    const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, getDerivedKey(), iv);
    return decipher.update(encryptedText, 'hex', 'utf8') + decipher.final('utf8');
  } catch (err) {
    const fallbackDecipher = crypto.createDecipheriv(LEGACY_ALGORITHM, getDerivedKey(LEGACY_FALLBACK_SECRET), iv);
    return fallbackDecipher.update(encryptedText, 'hex', 'utf8') + fallbackDecipher.final('utf8');
  }
}

function decrypt(cipherText) {
  if (!cipherText) return '';
  if (!cipherText.includes(':')) return cipherText;

  const parts = cipherText.split(':');

  if (parts[0] === CURRENT_VERSION && parts.length === 4) {
    const [, ivHex, authTagHex, encryptedHex] = parts;
    const decipher = crypto.createDecipheriv(
      CURRENT_ALGORITHM,
      getDerivedKey(),
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  }

  return decryptLegacy(cipherText);
}

function isEncryptedValue(value) {
  return typeof value === 'string' && value.includes(':');
}

module.exports = {
  encrypt,
  decrypt,
  isEncryptedValue
};
