const {
  inboxRepo,
  auditLogRepo
} = require('../database/repositories');
const gmailService = require('../services/gmail');
const replyDraftLifecycle = require('./replyDraftLifecycle');
const replyDraftEligibility = require('./replyDraftEligibility');

let activeSyncPromise = null;

const inboxMailbox = {
  list(folder) {
    return inboxRepo.list(folder).map(email => ({
      ...email,
      replyEligibility: replyDraftEligibility.evaluate(email)
    }));
  },

  async sync() {
    if (activeSyncPromise) {
      await auditLogRepo.log('Gmail', 'Info', 'Mailbox sync already in progress. Reusing active sync pass.');
      return activeSyncPromise;
    }

    activeSyncPromise = (async () => {
      const fetchedEmails = await gmailService.fetchMailboxFolders([
        { name: 'inbox', query: 'is:inbox', max: 12 },
        { name: 'sent', query: 'from:me', max: 8 },
        { name: 'spam', query: 'is:spam', max: 5 }
      ]);

      const syncedEmails = [];

      for (const email of fetchedEmails) {
        const saved = await inboxRepo.upsertSynced(email);
        syncedEmails.push(saved);
        await auditLogRepo.log('Gmail', 'Info', `Stored synced email in "${saved.folder}": "${saved.subject}"`);

        const eligibility = replyDraftEligibility.evaluate(saved);
        if (eligibility.canDraft) {
          replyDraftLifecycle.warmDraftForEmail(saved.id);
        }
      }

      return this.list('all');
    })();

    try {
      return await activeSyncPromise;
    } finally {
      activeSyncPromise = null;
    }
  },

  _resetForTests() {
    activeSyncPromise = null;
  }
};

module.exports = inboxMailbox;
