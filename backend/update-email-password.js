/**
 * Update Email Connection Password in Database
 * This updates the database with the correct password from .env
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateEmailPassword() {
  console.log('\n=== Updating Email Connection Password ===\n');

  const newPassword = process.env.EMAIL_PASSWORD;
  const emailAddress = process.env.EMAIL_ADDRESS;

  if (!newPassword || newPassword === 'your-16-char-app-password-here') {
    console.error('❌ ERROR: EMAIL_PASSWORD not set in .env or still has placeholder value');
    console.log('\nPlease set EMAIL_PASSWORD in your .env file with your Gmail app password.');
    process.exit(1);
  }

  if (newPassword.length !== 16) {
    console.warn(`⚠ WARNING: Gmail app passwords are usually 16 characters. Yours is ${newPassword.length} characters.`);
  }

  console.log(`Email: ${emailAddress}`);
  console.log(`New password length: ${newPassword.length}`);
  console.log(`Password preview: ${newPassword.substring(0, 4)}...${newPassword.substring(newPassword.length - 4)}`);
  console.log('');

  try {
    // Find all Gmail connections
    const connections = await prisma.emailInboxConnection.findMany({
      where: {
        provider: 'gmail',
        emailAddress: emailAddress,
      },
      include: {
        user: {
          select: { id: true, email: true, phone: true }
        }
      }
    });

    if (connections.length === 0) {
      console.log('No Gmail connections found in database.');
      console.log('App will use .env credentials automatically.');
      return;
    }

    console.log(`Found ${connections.length} Gmail connection(s) to update:\n`);

    for (const conn of connections) {
      console.log(`Updating connection ID: ${conn.id}`);
      console.log(`  User: ${conn.user.email || conn.user.phone}`);
      console.log(`  Old password: ${conn.password?.substring(0, 4)}...${conn.password?.substring(conn.password.length - 4)}`);
      
      await prisma.emailInboxConnection.update({
        where: { id: conn.id },
        data: {
          password: newPassword,
          imapHost: process.env.EMAIL_IMAP_HOST || 'imap.gmail.com',
          imapPort: parseInt(process.env.EMAIL_IMAP_PORT || '993'),
          imapSecure: process.env.EMAIL_IMAP_SECURE !== 'false',
          mailbox: process.env.EMAIL_MAILBOX || 'INBOX',
          folderId: process.env.EMAIL_MAILBOX || 'INBOX',
        }
      });

      console.log(`  ✓ Updated with new password: ${newPassword.substring(0, 4)}...${newPassword.substring(newPassword.length - 4)}`);
      console.log('');
    }

    console.log('✅ All connections updated successfully!');
    console.log('\nRestart your server and try again.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateEmailPassword();
