const cron = require('node-cron');
const patientService = require('../services/patientService');

// Runs once a day at 9:00 AM India time (explicit timezone — Render's default
// container timezone is UTC, so without this it would fire at 9AM UTC = 2:30PM IST).
const SCHEDULE = process.env.LOW_STOCK_REMINDER_CRON || '0 9 * * *';
const TIMEZONE = process.env.LOW_STOCK_REMINDER_TZ || 'Asia/Kolkata';

function start() {
  cron.schedule(
    SCHEDULE,
    async () => {
      console.log('[LowStockReminderJob] Running scheduled low-stock scan...');
      try {
        const results = await patientService.findAndSendLowStockAlerts();
        const sent = results.filter((r) => r.success).length;
        console.log(`[LowStockReminderJob] Done — ${sent}/${results.length} user(s) notified`);
      } catch (error) {
        console.error('[LowStockReminderJob] Failed:', error.message);
      }
    },
    { timezone: TIMEZONE }
  );
  console.log(`[LowStockReminderJob] Scheduled with cron pattern "${SCHEDULE}" (${TIMEZONE})`);
}

module.exports = { start };
