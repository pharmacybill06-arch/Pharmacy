const cron = require('node-cron');
const patientService = require('../services/patientService');

// Runs every day at 9:00 AM server time
const SCHEDULE = process.env.LOW_STOCK_REMINDER_CRON || '0 9 * * *';

function start() {
  cron.schedule(SCHEDULE, async () => {
    console.log('[LowStockReminderJob] Running scheduled low-stock scan...');
    try {
      const results = await patientService.findAndSendLowStockAlerts();
      const sent = results.filter((r) => r.success).length;
      console.log(`[LowStockReminderJob] Done — ${sent}/${results.length} user(s) notified`);
    } catch (error) {
      console.error('[LowStockReminderJob] Failed:', error.message);
    }
  });
  console.log(`[LowStockReminderJob] Scheduled with cron pattern "${SCHEDULE}"`);
}

module.exports = { start };
