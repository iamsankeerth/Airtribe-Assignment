const { auditLogRepo } = require('../database/repositories');

const CATEGORY_RULES = {
  auth: { minIntervalMs: 300, quotaBaseMs: 1000, quotaCapMs: 5 * 60 * 1000 },
  send: { minIntervalMs: 750, quotaBaseMs: 30000, quotaCapMs: 15 * 60 * 1000 },
  sync: { minIntervalMs: 1500, quotaBaseMs: 60000, quotaCapMs: 20 * 60 * 1000 },
  analysis: { minIntervalMs: 2500, quotaBaseMs: 60000, quotaCapMs: 20 * 60 * 1000 },
  default: { minIntervalMs: 500, quotaBaseMs: 15000, quotaCapMs: 10 * 60 * 1000 }
};

const categoryTails = new Map();
const lastRunAt = new Map();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeMessage(err) {
  return String(err && err.message ? err.message : err || '');
}

function isAuthError(err) {
  const message = normalizeMessage(err).toLowerCase();
  return (
    message.includes('oauth') ||
    message.includes('token') ||
    message.includes('auth') ||
    message.includes('invalid_grant') ||
    message.includes('credentials')
  );
}

function isQuotaError(err) {
  const message = normalizeMessage(err).toLowerCase();
  return (
    err?.code === 429 ||
    err?.status === 429 ||
    message.includes('rate limit') ||
    message.includes('rate-limit') ||
    message.includes('userratelimitexceeded') ||
    message.includes('ratelimitexceeded') ||
    message.includes('quota') ||
    message.includes('too many requests') ||
    message.includes('resource exhausted')
  );
}

function classifyError(err) {
  if (isAuthError(err)) return 'auth';
  if (isQuotaError(err)) return 'quota';
  return 'transient';
}

function getRetryDelayMs(err, attempt = 1) {
  const rule = CATEGORY_RULES.default;
  const category = classifyError(err);
  const baseMs = category === 'quota'
    ? CATEGORY_RULES.sync.quotaBaseMs
    : rule.quotaBaseMs;
  const capMs = category === 'quota'
    ? CATEGORY_RULES.sync.quotaCapMs
    : rule.quotaCapMs;
  const factor = Math.max(1, attempt);
  return Math.min(capMs, baseMs * Math.pow(2, factor - 1));
}

async function run(category, operation, fn) {
  const rule = CATEGORY_RULES[category] || CATEGORY_RULES.default;
  const previous = categoryTails.get(category) || Promise.resolve();

  const current = previous.then(async () => {
    const lastRun = lastRunAt.get(category) || 0;
    const waitMs = Math.max(0, (lastRun + rule.minIntervalMs) - Date.now());

    if (waitMs > 0) {
      await auditLogRepo.log(
        'Gmail',
        'Info',
        `Quota guard delaying ${operation} by ${Math.ceil(waitMs / 1000)}s for ${category} traffic.`
      );
      await delay(waitMs);
    }

    try {
      return await fn();
    } catch (err) {
      if (isQuotaError(err)) {
        await auditLogRepo.log('Gmail', 'Warning', `Gmail quota pressure during ${operation}: ${normalizeMessage(err)}`);
      }
      throw err;
    } finally {
      lastRunAt.set(category, Date.now());
    }
  });

  categoryTails.set(category, current.catch(() => {}));
  return current;
}

module.exports = {
  run,
  classifyError,
  isAuthError,
  isQuotaError,
  getRetryDelayMs
};
