const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const db = require('./src/database/db');
const sendQueue = require('./src/modules/sendQueue');
const apiRouter = require('./src/routes/api');

dotenv.config();

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  db.init();
  app.use('/api', apiRouter);

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  return app;
}

function startServer(port = process.env.PORT || 5000) {
  const app = createApp();
  sendQueue.start();

  const server = app.listen(port, () => {
    console.log(`==================================================`);
    console.log(`   DRAFTLY BACKEND IS RUNNING LOCALLY!`);
    console.log(`   URL: http://localhost:${port}`);
    console.log(`==================================================`);
  });

  return { app, server };
}

function stopServer(server) {
  sendQueue.stop();
  if (server) {
    server.close(() => {
      console.log('Express server closed.');
    });
  }
}

if (require.main === module) {
  const { server } = startServer();

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received. Shutting down gracefully...');
    stopServer(server);
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('SIGINT signal received. Shutting down gracefully...');
    stopServer(server);
    process.exit(0);
  });
}

module.exports = {
  createApp,
  startServer,
  stopServer
};
