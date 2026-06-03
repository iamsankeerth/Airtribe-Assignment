const {
  inboxRepo,
  auditLogRepo
} = require('../database/repositories');
const gmailService = require('../services/gmail');
const replyDraftLifecycle = require('./replyDraftLifecycle');
const replyDraftEligibility = require('./replyDraftEligibility');

const inboxMailbox = {
  list(folder) {
    return inboxRepo.list(folder).map(email => ({
      ...email,
      replyEligibility: replyDraftEligibility.evaluate(email)
    }));
  },

  async sync() {
    const fetchedEmails = await gmailService.fetchMailboxFolders([
      { name: 'inbox', query: 'is:inbox', max: 20 },
      { name: 'sent', query: 'from:me', max: 15 },
      { name: 'spam', query: 'is:spam', max: 10 }
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
  }
};

module.exports = inboxMailbox;
