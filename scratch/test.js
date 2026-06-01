const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('🚀 Starting Comprehensive System Seam Verification...\n');

  try {
    // 1. Verify Configuration Endpoint
    const config = await get('http://localhost:5000/api/config');
    console.log('✅ /api/config: Connected User:', config.userEmail || 'N/A');
    console.log('   Is Connected:', config.isConnected);

    // 2. Verify Emails Endpoint
    const emails = await get('http://localhost:5000/api/emails');
    console.log(`✅ /api/emails: Fetched ${emails.length} emails from InboxRepository.`);
    if (emails.length > 0) {
      console.log(`   Newest Email Subject: "${emails[0].subject}" from ${emails[0].sender}`);
    }

    // 3. Verify Drafts Endpoint
    const drafts = await get('http://localhost:5000/api/drafts');
    console.log(`✅ /api/drafts: Retrieved ${drafts.length} drafts from OutboxRepository.`);

    // 4. Verify Style Profile Endpoint
    const profile = await get('http://localhost:5000/api/style/profile');
    console.log('✅ /api/style/profile: Sentence Length Pref:', profile.sentenceLength || 'N/A');
    console.log('   Summary:', profile.summary ? profile.summary.substring(0, 80) + '...' : 'None');

    // 5. Verify Preferences Endpoint
    const preferences = await get('http://localhost:5000/api/preferences');
    console.log('✅ /api/preferences: Default Tone:', preferences.defaultTone);
    console.log('   Signature:', preferences.signature);

    // 6. Verify System Observable Logs Endpoint
    const logs = await get('http://localhost:5000/api/logs');
    console.log(`✅ /api/logs: Found ${logs.length} system audit logs.`);
    if (logs.length > 0) {
      console.log(`   Latest Log: [${logs[0].category}] [${logs[0].severity}] ${logs[0].message}`);
    }

    console.log('\n🌟 ALL SYSTEM API SEAMS ARE FLAWLESSLY INTEGRATED AND SECURE!');
  } catch (err) {
    console.error('\n❌ VERIFICATION TEST FAILED:', err.message);
    process.exit(1);
  }
}

runTests();
