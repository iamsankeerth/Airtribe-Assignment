const db = require('../src/database/db');
db.init();

const emails = db.findAll('emails') || [];
const sentEmails = emails.filter(e => e.folder === 'sent');

console.log(`=== ANALYZING ${sentEmails.length} SENT EMAILS ===\n`);

sentEmails.forEach((email, idx) => {
  console.log(`[Email #${idx + 1}]`);
  console.log(`ID: ${email.id}`);
  console.log(`Thread ID: ${email.threadId}`);
  console.log(`Recipient: ${email.recipient}`);
  console.log(`Subject: ${email.subject}`);
  console.log(`Timestamp: ${email.timestamp}`);
  console.log(`Body Snippet: ${email.snippet || email.body.substring(0, 150)}...`);
  console.log(`Body Length: ${email.body.length} chars`);
  console.log('-'.repeat(50));
});
