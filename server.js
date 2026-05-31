const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const db = require('./src/database/db');
const queue = require('./src/services/queue');
const apiRouter = require('./src/routes/api');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and parse JSON bodies
app.use(cors());
app.use(express.json());

// Serve static dashboard assets from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
db.init();

// Start background Send Queue Scheduler
queue.startScheduler();

// Mount REST API endpoints
app.use('/api', apiRouter);

// Serve dashboard index for any unhandled routes (SPA compatibility)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Graceful shutdown handling
const server = app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`   DRAFTLY BACKEND IS RUNNING LOCALLY!`);
  console.log(`   URL: http://localhost:${PORT}`);
  console.log(`   Mode: ${db.get('credentials').mode} Mode`);
  console.log(`==================================================`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received. Shutting down gracefully...');
  queue.stopScheduler();
  server.close(() => {
    console.log('Express server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received. Shutting down gracefully...');
  queue.stopScheduler();
  server.close(() => {
    console.log('Express server closed.');
    process.exit(0);
  });
});
