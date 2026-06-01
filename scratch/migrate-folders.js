const db = require('../src/database/db');
db.init();

const emails = db.findAll('emails') || [];
const creds = db.get('credentials') || {};
const userEmail = (creds.userEmail || 'sankeerthmvsr@gmail.com').toLowerCase().trim();

console.log(`Starting folder migration for ${emails.length} emails...`);
console.log(`User email for detection: ${userEmail}`);

let migratedInbox = 0;
let migratedSent = 0;

for (const email of emails) {
  if (!email.folder) {
    const sender = (email.sender || '').toLowerCase();
    
    // Check if sender is the logged in user
    if (sender.includes(userEmail)) {
      email.folder = 'sent';
      migratedSent++;
    } else {
      email.folder = 'inbox';
      migratedInbox++;
    }
  }
}

db.save();

console.log(`\nFolder Migration Completed Successfully!`);
console.log(`- Migrated to 'inbox': ${migratedInbox}`);
console.log(`- Migrated to 'sent': ${migratedSent}`);

const finalCounts = {};
db.findAll('emails').forEach(e => {
  finalCounts[e.folder] = (finalCounts[e.folder] || 0) + 1;
});
console.log('\nFinal Folder Distribution in Database:', finalCounts);
