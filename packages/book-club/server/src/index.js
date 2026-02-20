require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { runMigrations, seedData } = require('./db/migrate');

const authRoutes = require('./routes/auth');
const inviteRoutes = require('./routes/invites');
const roundRoutes = require('./routes/rounds');
const { roundProposalsRouter, proposalRouter } = require('./routes/proposals');
const voteRoutes = require('./routes/votes');
const { roundMeetingsRouter, meetingRouter } = require('./routes/meetings');
const notificationRoutes = require('./routes/notifications');
const exportRoutes = require('./routes/export');
const adminRoutes = require('./routes/admin');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());

// Auth
app.use('/api/auth', authRoutes);

// Invites
app.use('/api/invites', inviteRoutes);

// Rounds (core CRUD)
app.use('/api/rounds', roundRoutes);

// Proposals — nested under rounds, and standalone delete
app.use('/api/rounds/:id/proposals', roundProposalsRouter);
app.use('/api/proposals', proposalRouter);

// Votes — nested under rounds
app.use('/api/rounds/:id/votes', voteRoutes);

// Meetings — nested under rounds, and standalone operations
app.use('/api/rounds/:id/meetings', roundMeetingsRouter);
app.use('/api/meetings', meetingRouter);

// Notifications
app.use('/api/notifications', notificationRoutes);

// Export
app.use('/api/export', exportRoutes);

// Admin helpers
app.use('/api/admin', adminRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await runMigrations();
    await seedData();
    app.listen(PORT, () => {
      console.log(`Book Club API running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
