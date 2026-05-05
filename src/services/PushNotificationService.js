const { Expo } = require('expo-server-sdk');
const prisma = require('../config/prisma');

let expo = new Expo();

const sendPushNotification = async (userId, title, body, data = {}) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true }
    });

    if (!user || !user.pushToken) {
      console.log(`[Push] User ${userId} has no push token. Skipping.`);
      return;
    }

    if (!Expo.isExpoPushToken(user.pushToken)) {
      console.error(`[Push] Push token ${user.pushToken} is not a valid Expo push token`);
      return;
    }

    const messages = [{
      to: user.pushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data,
      priority: 'high',
      channelId: 'default',
    }];

    let chunks = expo.chunkPushNotifications(messages);
    for (let chunk of chunks) {
      try {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        console.log('[Push] Sent notification chunk:', ticketChunk);
      } catch (error) {
        console.error('[Push] Error sending push notification chunk:', error);
      }
    }
  } catch (error) {
    console.error('[Push] Error in sendPushNotification service:', error);
  }
};

module.exports = { sendPushNotification };
