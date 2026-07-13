/**
 * Sends push notifications via Expo's push API.
 * https://docs.expo.dev/push-notifications/sending-notifications/
 * No SDK needed — it's a plain HTTPS POST.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * @param {string} expoPushToken - e.g. "ExponentPushToken[xxxxxxxx]"
 * @param {{ title: string, body: string, data?: object }} message
 */
async function sendPushNotification(expoPushToken, { title, body, data = {} }) {
  if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) {
    throw new Error(`Invalid Expo push token: ${expoPushToken}`);
  }

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: expoPushToken,
      title,
      body,
      data,
      sound: 'default',
    }),
  });

  const result = await res.json();
  const ticket = result?.data;

  if (!res.ok || ticket?.status === 'error') {
    throw new Error(`Expo push send failed: ${ticket?.message || JSON.stringify(result)}`);
  }

  return ticket;
}

module.exports = { sendPushNotification };
