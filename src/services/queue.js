const db = require('../database/db');
const gmailService = require('./gmail');
const mockGmailService = require('./mockGmail');

class SendQueueService {
  constructor() {
    this.isProcessing = false;
    this.activeLocks = new Set(); // Tracks active draft IDs to guarantee idempotency
  }

  // Pick up any drafts marked as 'Approved' or 'Retrying' and process them
  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const drafts = db.findAll('drafts');
      // Find drafts that need to be sent
      const pendingDrafts = drafts.filter(
        d => (d.status === 'Approved' || d.status === 'Retrying') && d.retryCount < 5
      );

      if (pendingDrafts.length > 0) {
        await db.log('Queue', 'Info', `Found ${pendingDrafts.length} pending draft(s) in sending queue.`);
      }

      for (const draft of pendingDrafts) {
        // Guarantee Idempotency: skip if another thread is currently processing this draft
        if (this.activeLocks.has(draft.id)) {
          continue;
        }

        // Lock the draft
        this.activeLocks.add(draft.id);

        try {
          await this.processDraftSend(draft);
        } catch (err) {
          console.error(`Error processing draft ${draft.id} in queue:`, err);
        } finally {
          // Unlock the draft
          this.activeLocks.delete(draft.id);
        }
      }
    } catch (err) {
      console.error('Queue processing cycle error:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  async processDraftSend(draft) {
    const creds = db.get('credentials');
    const email = db.findById('emails', draft.emailId);

    if (!email) {
      await db.log('Queue', 'Error', `Orphaned draft ${draft.id}: Matching email ${draft.emailId} not found. Archiving draft.`);
      await db.updateById('drafts', draft.id, { status: 'Rejected', errorLog: 'Original email not found.' });
      return;
    }

    await db.log('Queue', 'Info', `Processing transmission lock for Draft: ${draft.id}`);

    // Update status to "Sending"
    await db.updateById('drafts', draft.id, { status: 'Sending' });

    const activeService = creds.mode === 'Sandbox' ? mockGmailService : gmailService;

    try {
      // Send the reply!
      const sendResult = await activeService.sendReply(
        draft.id,
        draft.content,
        email.threadId,
        email.subject,
        email.sender
      );

      // Success updates
      await db.updateById('drafts', draft.id, {
        status: 'Sent',
        sentAt: new Date().toISOString(),
        messageId: sendResult.messageId,
        errorLog: ''
      });

      // Mark the original email as read/replied
      await db.updateById('emails', email.id, { isRead: true });
      await db.log('Queue', 'Info', `Successfully processed send event for Draft: ${draft.id}. Message dispatched!`);

    } catch (err) {
      const errorMessage = err.message || 'Unknown network error';
      await db.log('Queue', 'Warning', `Send attempt failed for Draft: ${draft.id} - Error: ${errorMessage}`);

      // Check if this is a fatal OAuth2 error
      const isAuthError =
        errorMessage.toLowerCase().includes('oauth') ||
        errorMessage.toLowerCase().includes('token') ||
        errorMessage.toLowerCase().includes('auth') ||
        errorMessage.toLowerCase().includes('invalid_grant') ||
        errorMessage.toLowerCase().includes('credentials');

      if (isAuthError) {
        // Fatal Auth Error: Do not retry automatically, notify the user.
        await db.log('Queue', 'Error', 'Fatal Authentication failure detected. Halting queue and notifying client.');
        
        await db.updateById('drafts', draft.id, {
          status: 'Failed',
          errorLog: `Fatal Auth Error: ${errorMessage}. Please reconnect your Gmail account.`
        });

        // Set isConnected to false and trigger user alert in system state
        creds.isConnected = false;
        db.set('credentials', creds);
        
        await db.log('System', 'Error', 'USER ALERT: Gmail account disconnected due to expired or revoked OAuth2 tokens.');
      } else {
        // Transient error: schedule retry with exponential backoff
        const nextRetryCount = (draft.retryCount || 0) + 1;
        
        if (nextRetryCount >= 5) {
          // Exhausted all retries
          await db.log('Queue', 'Error', `Exceeded maximum retry attempts (5/5) for Draft: ${draft.id}. Halting.`);
          await db.updateById('drafts', draft.id, {
            status: 'Failed',
            retryCount: nextRetryCount,
            errorLog: `Exceeded maximum send attempts. Last error: ${errorMessage}`
          });
        } else {
          // Calculate backoff time (seconds: 5, 10, 20, 40)
          const backoffSec = Math.pow(2, nextRetryCount - 1) * 5;
          const nextAttemptTime = Date.now() + backoffSec * 1000;

          await db.log('Queue', 'Info', `Draft ${draft.id} scheduled for retry #${nextRetryCount} in ${backoffSec} seconds (at ${new Date(nextAttemptTime).toLocaleTimeString()}).`);

          await db.updateById('drafts', draft.id, {
            status: 'Retrying',
            retryCount: nextRetryCount,
            errorLog: `Attempt #${nextRetryCount} failed: ${errorMessage}. Next retry in ${backoffSec}s.`,
            nextAttemptAt: nextAttemptTime
          });
        }
      }
    }
  }

  // Trigger continuous processing every 10 seconds in the background
  startScheduler() {
    // Process queue immediately on startup
    this.processQueue();

    // Set interval to check queue
    this.intervalId = setInterval(() => {
      // Filter out retries that haven't met their backoff timing yet
      const drafts = db.findAll('drafts');
      const now = Date.now();
      const hasEligibleDrafts = drafts.some(
        d => (d.status === 'Approved') || 
             (d.status === 'Retrying' && d.nextAttemptAt && now >= d.nextAttemptAt)
      );

      if (hasEligibleDrafts) {
        this.processQueue();
      }
    }, 5000); // Poll every 5 seconds for rapid feedback

    db.log('System', 'Info', 'Send Queue Scheduler background daemon started.');
  }

  stopScheduler() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      db.log('System', 'Info', 'Send Queue Scheduler stopped.');
    }
  }
}

module.exports = new SendQueueService();
