const db = require('../src/database/db');
db.init();

const emails = db.findAll('emails') || [];
const sentEmails = emails.filter(e => e.folder === 'sent');

console.log(`=== FULL BODY RETRIEVAL FOR ${sentEmails.length} SENT EMAILS ===\n`);

// Group by Thread ID
const threads = {};
for (const email of sentEmails) {
  if (!threads[email.threadId]) {
    threads[email.threadId] = [];
  }
  threads[email.threadId].push(email);
}

Object.keys(threads).forEach((threadId, tIdx) => {
  console.log(`=========================================`);
  console.log(`THREAD #${tIdx + 1} - ID: ${threadId}`);
  console.log(`Subject: ${threads[threadId][0].subject}`);
  console.log(`Recipient: ${threads[threadId][0].recipient}`);
  console.log(`=========================================\n`);
  
  // Sort by date ascending to show history
  const sortedMsgs = [...threads[threadId]].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  sortedMsgs.forEach((msg, mIdx) => {
    console.log(`[Message #${mIdx + 1}] - Date: ${msg.timestamp}`);
    console.log(`Sender: ${msg.sender}`);
    console.log(`Snippet: ${msg.snippet}`);
    console.log(`Body (Truncated first 1200 chars):`);
    console.log(msg.body.substring(0, 1200));
    console.log('\n' + '.'.repeat(40) + '\n');
  });
});
