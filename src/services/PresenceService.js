const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  retryStrategy: (times) => {
    if (times > 3) return null; // stop retrying after 3 times to avoid spamming
    return Math.min(times * 50, 2000);
  }
});

redis.on('error', (err) => {
  console.warn('Redis connection failed, using in-memory fallback.');
});

const PRESENCE_KEY_PREFIX = 'user:presence:';
const LAST_SEEN_KEY_PREFIX = 'user:lastseen:';

const fallbackPresence = new Map();
const fallbackLastSeen = new Map();

const setOnline = async (userId, broadcastStatus) => {
  const uid = String(userId);
  try {
    await redis.set(`${PRESENCE_KEY_PREFIX}${uid}`, 'ONLINE', 'EX', 86400);
    await redis.set(`${LAST_SEEN_KEY_PREFIX}${uid}`, Math.floor(Date.now() / 1000));
  } catch (err) {
    fallbackPresence.set(uid, 'ONLINE');
    fallbackLastSeen.set(uid, Math.floor(Date.now() / 1000));
  }
  if (broadcastStatus) broadcastStatus(uid, 'đang hoạt động');
};

const setOffline = async (userId, broadcastStatus) => {
  const uid = String(userId);
  try {
    await redis.del(`${PRESENCE_KEY_PREFIX}${uid}`);
    await redis.set(`${LAST_SEEN_KEY_PREFIX}${uid}`, Math.floor(Date.now() / 1000));
  } catch (err) {
    fallbackPresence.delete(uid);
    fallbackLastSeen.set(uid, Math.floor(Date.now() / 1000));
  }
  if (broadcastStatus) broadcastStatus(uid, await getUserStatus(uid));
};

const getUserStatus = async (userId) => {
  const uid = String(userId);
  try {
    const isOnline = await redis.exists(`${PRESENCE_KEY_PREFIX}${uid}`);
    if (isOnline) {
      return 'đang hoạt động';
    }
    const lastSeenStr = await redis.get(`${LAST_SEEN_KEY_PREFIX}${uid}`);
    return calculateStatus(lastSeenStr);
  } catch (err) {
    if (fallbackPresence.has(uid)) return 'đang hoạt động';
    return calculateStatus(fallbackLastSeen.get(uid));
  }
};

const calculateStatus = (lastSeenStr) => {
  if (lastSeenStr) {
    const lastSeen = parseInt(lastSeenStr);
    const now = Math.floor(Date.now() / 1000);
    const diff = now - lastSeen;

    if (diff < 60) return 'hoạt động vừa mới đây';
    if (diff < 3600) return `hoạt động ${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `hoạt động ${Math.floor(diff / 3600)} giờ trước`;
    return 'ngoại tuyến';
  }
  return 'ngoại tuyến';
};

module.exports = { setOnline, setOffline, getUserStatus };
