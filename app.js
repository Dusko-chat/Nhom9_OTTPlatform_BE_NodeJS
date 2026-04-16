require('dotenv').config();

process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const connectDB = require('./src/config/db');
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const conversationRoutes = require('./src/routes/conversationRoutes');
const chatRoutes = require('./src/routes/chatRoutes');
const friendRoutes = require('./src/routes/friendRoutes');
const uploadRoutes = require('./src/routes/uploadRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const eventRoutes = require('./src/routes/eventRoutes');
const aiRoutes = require('./src/routes/aiRoutes');
const statusRoutes = require('./src/routes/statusRoutes');
const departmentRoutes = require('./src/routes/departmentRoutes');
const statsRoutes = require('./src/routes/statsRoutes');
const attendanceRoutes = require('./src/routes/attendanceRoutes');
const { setupStompSocket } = require('./src/sockets/stompHandler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

setupStompSocket(wss);

// Connect to Database
connectDB();

// Middleware
// CORS Configuration - Cho phép tất cả để Mobile/Web đều vào được
app.use(cors({
  origin: true, // Cho phép mọi origin gửi request đến
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/api/status/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', chatRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/attendance', attendanceRoutes);

app.get('/api/status/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.send('OTT Backend Node.js is running...');
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
