const db = require('../src/database/db');
db.init();

const logs = db.findAll('logs') || [];
console.log(`Total Logs in Database: ${logs.length}`);

console.log('\n--- LATEST 20 LOG ENTRIES ---');
const latestLogs = [...logs]
  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  .slice(0, 20);

for (const log of latestLogs) {
  console.log(`[${log.timestamp}] [${log.category}] [${log.severity}] ${log.message}`);
}
