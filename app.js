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
const reportRoutes = require('./src/routes/reportRoutes');
const { setupStompSocket } = require('./src/sockets/stompHandler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

setupStompSocket(wss);

// Connect to Database
connectDB();

// Middleware
// CORS Configuration - Cho phép các domain cụ thể cho production
const allowedOrigins = [
  'https://dusko.io.vn',
  'https://www.dusko.io.vn',
  'http://localhost:5173',
  'http://localhost:5174'
];

app.use(cors({
  origin: function (origin, callback) {
    // Cho phép requests không có origin (như mobile apps hoặc curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('exp://')) {
      callback(null, true);
    } else {
      // Trong quá trình phát triển, có thể tạm thời cho phép tất cả nếu muốn
      callback(null, true); 
    }
  },
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
app.use('/api/reports', reportRoutes);

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
