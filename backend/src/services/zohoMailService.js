/**
 * Generic mailbox service backed by IMAP.
 * Supports Gmail, Zoho Mail, and custom IMAP providers using app passwords.
 */

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const dns = require('dns').promises;
const { getUserEmailConnection, touchConnectionSync } = require('./emailConnectionService');

function normalizeAddress(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value.address) return value.address;
  if (value.name && value.address) return `${value.name} <${value.address}>`;
  return '';
}

function normalizeMailboxError(error, connection) {
  if (!error) {
    return new Error('Unknown mailbox error');
  }

  const message = error.message || '';
  const responseText = error.responseText || error.serverResponse || error.response || '';
  const combined = `${message} ${responseText}`.trim();

  if (error.code === 'ETIMEOUT' || /timeout/i.test(error.message || '')) {
    return new Error(
      `Mailbox connection timed out for ${connection.emailAddress || 'this account'}. ` +
      `Please verify IMAP host/port, app password, and that IMAP is enabled.`
    );
  }

  if (/authentication|login|invalid credentials|auth|password|credentials/i.test(combined)) {
    return new Error(
      `Mailbox login failed for ${connection.emailAddress || 'this account'}. ` +
      `Please check the email address and app password.`
    );
  }

  if (/app.*password|application.*password/i.test(combined)) {
    return new Error(
      `Mailbox login failed for ${connection.emailAddress || 'this account'}. ` +
      `Please use an app-specific password instead of the normal mailbox password.`
    );
  }

  if (/imap.*disabled|not enabled/i.test(combined)) {
    return new Error(
      `IMAP is not enabled for ${connection.emailAddress || 'this account'}. ` +
      `Enable IMAP in the mailbox settings and try again.`
    );
  }

  if (/mailbox.*does not exist|no such mailbox|unknown mailbox/i.test(combined)) {
    return new Error(
      `Mailbox folder "${connection.mailbox || connection.folderId || 'INBOX'}" was not found. ` +
      `Try using INBOX as the mailbox folder.`
    );
  }

  if (/command failed/i.test(combined)) {
    return new Error(
      `Mailbox command failed for ${connection.emailAddress || 'this account'}. ` +
      `${responseText || 'Please verify mailbox provider, IMAP settings, and app password.'}`
    );
  }

  return error;
}

function getAttachmentFileName(attachment, fallback = 'attachment') {
  return attachment.filename || attachment.fileName || fallback;
}

function isAttachmentContentType(contentType = '') {
  const lower = String(contentType).toLowerCase();
  return (
    lower.includes('application/pdf') ||
    lower.includes('text/csv') ||
    lower.includes('application/csv') ||
    lower.includes('spreadsheet') ||
    lower.includes('excel') ||
    lower.includes('officedocument')
  );
}

function buildEmailSummary(uid, mailbox, parsed, flags, internalDate) {
  const subject = parsed.subject || '(no subject)';
  const fromValue = Array.isArray(parsed.from?.value) ? parsed.from.value[0] : parsed.from?.value;
  const sender = normalizeAddress(fromValue);
  const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
  const preview = (parsed.text || parsed.html || '').replace(/\s+/g, ' ').trim().slice(0, 200);

  return {
    messageId: String(uid),
    folderId: mailbox,
    subject,
    fromAddress: sender,
    sender,
    hasAttachment: attachments.length > 0,
    receivedTime: internalDate ? String(internalDate.getTime()) : String(Date.now()),
    summary: preview,
    flags: Array.from(flags || []),
  };
}

function mapAttachment(attachment, index) {
  return {
    attachmentId: String(index),
    attachmentName: getAttachmentFileName(attachment, `attachment-${index + 1}`),
    contentType: attachment.contentType || 'application/octet-stream',
    size: attachment.size || (attachment.content ? attachment.content.length : 0),
    disposition: 'attachment',
  };
}

async function resolveImapHost(hostname) {
  if (!hostname) return hostname;

  try {
    const result = await dns.lookup(hostname, { family: 4 });
    return result.address || hostname;
  } catch (error) {
    console.warn(`[Mailbox] IPv4 lookup failed for ${hostname}, falling back to hostname:`, error.message);
    return hostname;
  }
}

// Connection cache to prevent duplicate simultaneous connections
const activeConnections = new Map();

async function createImapMailClient(connection) {
  if (!connection.emailAddress || !connection.password || !connection.imapHost) {
    throw new Error('Mailbox connection is missing IMAP email, password, or host');
  }

  // Debug logging (remove after fixing)
  console.log('[Mailbox] Creating IMAP client:', {
    emailAddress: connection.emailAddress,
    passwordLength: connection.password?.length,
    password: connection.password || 'NONE',
    imapHost: connection.imapHost,
    imapPort: connection.imapPort,
    source: connection.source,
  });

  const connectionKey = `${connection.emailAddress}:${connection.imapHost}`;
  
  // Check if there's already an active connection attempt
  if (activeConnections.has(connectionKey)) {
    const existingAttempt = activeConnections.get(connectionKey);
    const timeSinceStart = Date.now() - existingAttempt.startTime;
    
    if (timeSinceStart < 30000) { // If less than 30 seconds old
      console.log(`[Mailbox] Waiting for existing connection attempt (${timeSinceStart}ms ago)...`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    }
  }

  async function withMailbox(mailboxOverride, fn) {
    const startTime = Date.now();
    activeConnections.set(connectionKey, { startTime });
    
    const client = new ImapFlow({
      host: connection.imapHost,
      port: connection.imapPort || 993,
      secure: true,
      auth: {
        user: connection.emailAddress,
        pass: connection.password,
      },
      logger: false,
    });
    
    let lastError = null;
    client.on('error', (error) => {
      lastError = error;
      console.error('[Mailbox] IMAP client error:', error.message);
    });

    const mailbox = mailboxOverride || connection.mailbox || connection.folderId || 'INBOX';

    let lock = null;
    try {
      await client.connect();
      lock = await client.getMailboxLock(mailbox);
      return await fn(client, mailbox);
    } catch (error) {
      const rootError =
        error?.message === 'Connection not available' && lastError
          ? lastError
          : (error || lastError);
      console.error('[Mailbox] Operation failed:', {
        provider: connection.provider,
        emailAddress: connection.emailAddress,
        imapHost: connection.imapHost,
        imapPort: connection.imapPort,
        mailbox,
        code: rootError?.code,
        message: rootError?.message,
        responseText: rootError?.responseText || rootError?.serverResponse || rootError?.response || null,
      });
      throw normalizeMailboxError(rootError, connection);
    } finally {
      activeConnections.delete(connectionKey);
      if (lock) {
        lock.release();
      }
      await client.logout().catch(() => {});
    }
  }

  async function fetchMessageSource(client, uid) {
    const message = await client.fetchOne(
      Number(uid),
      { uid: true, source: true, flags: true, internalDate: true },
      { uid: true }
    );
    if (!message?.source) {
      throw new Error(`Email ${uid} not found`);
    }

    const raw = Buffer.isBuffer(message.source) ? message.source : Buffer.from(message.source);
    const parsed = await simpleParser(raw);

    return {
      raw,
      parsed,
      flags: message.flags || new Set(),
      internalDate: message.internalDate || null,
    };
  }

  async function fetchEmails(limit = 50, folderId = null) {
    return withMailbox(folderId, async (client, mailbox) => {
      const messages = [];
      
      // Get mailbox info to know total messages
      const mailboxInfo = client.mailbox;
      const totalMessages = mailboxInfo?.exists || 0;
      
      if (totalMessages === 0) {
        return [];
      }
      
      // Calculate range to fetch the LATEST messages
      // If we have 131 messages and want 50, fetch 82:131 (latest 50)
      const start = Math.max(1, totalMessages - limit + 1);
      const end = totalMessages;
      const range = `${start}:${end}`;
      
      console.log(`[Mailbox] Fetching messages ${start} to ${end} (total: ${totalMessages})`);
      
      // Fetch only the latest 'limit' messages using envelope (lightweight)
      for await (const message of client.fetch(range, { uid: true, envelope: true, flags: true, internalDate: true }, { uid: true })) {
        const subject = message.envelope?.subject || '(no subject)';
        const fromValue = message.envelope?.from?.[0];
        const sender = fromValue?.address || fromValue?.name || '';
        const hasAttachment = false; // We'll check this later if needed
        const receivedTime = message.internalDate ? String(message.internalDate.getTime()) : String(Date.now());
        
        messages.push({
          messageId: String(message.uid),
          folderId: mailbox,
          subject,
          fromAddress: sender,
          sender,
          hasAttachment,
          receivedTime,
          summary: subject.substring(0, 200),
          flags: Array.from(message.flags || []),
        });
      }

      await touchConnectionSync(connection.id);
      
      // Sort by receivedTime descending (newest first)
      return messages.sort((a, b) => Number(b.receivedTime) - Number(a.receivedTime));
    });
  }

  async function searchEmails(searchKey = 'invoice', limit = 50) {
    const lower = String(searchKey || '').toLowerCase();
    const emails = await fetchEmails(Math.max(limit * 3, limit));
    return emails.filter((email) => {
      const haystack = `${email.subject} ${email.sender} ${email.summary}`.toLowerCase();
      return haystack.includes(lower);
    }).slice(0, limit);
  }

  async function getEmailDetails(messageId, folderId) {
    return withMailbox(folderId, async (client, mailbox) => {
      const { parsed, flags, internalDate } = await fetchMessageSource(client, messageId);
      const attachments = (parsed.attachments || []).map(mapAttachment);
      const fromValue = Array.isArray(parsed.from?.value) ? parsed.from.value[0] : parsed.from?.value;

      return {
        messageId: String(messageId),
        folderId: mailbox,
        subject: parsed.subject || '(no subject)',
        fromAddress: normalizeAddress(fromValue),
        sender: normalizeAddress(fromValue),
        attachments,
        hasAttachment: attachments.length > 0,
        receivedTime: internalDate ? String(internalDate.getTime()) : String(Date.now()),
        flags: Array.from(flags || []),
      };
    });
  }

  async function downloadAttachment(messageId, attachmentId, folderId) {
    return withMailbox(folderId, async (client) => {
      const { parsed } = await fetchMessageSource(client, messageId);
      const attachments = parsed.attachments || [];
      const attachment = attachments[Number(attachmentId)];

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      return attachment.content;
    });
  }

  async function getEmailContent(messageId, folderId) {
    return withMailbox(folderId, async (client) => {
      const { parsed } = await fetchMessageSource(client, messageId);
      return {
        content: parsed.html || parsed.textAsHtml || parsed.text || '',
        text: parsed.text || '',
        subject: parsed.subject || '(no subject)',
      };
    });
  }

  async function markAsRead(messageId, folderId) {
    return withMailbox(folderId, async (client) => {
      await client.messageFlagsAdd(Number(messageId), ['\\Seen'], { uid: true });
    });
  }

  return {
    connection,
    fetchEmails,
    searchEmails,
    getEmailDetails,
    downloadAttachment,
    getEmailContent,
    markAsRead,
    isAttachmentContentType,
  };
}

async function getZohoMailClientForUser(userId, options = {}) {
  const connection = await getUserEmailConnection(userId, options);
  return createImapMailClient(connection);
}

module.exports = {
  createImapMailClient,
  getZohoMailClientForUser,
  isAttachmentContentType,
};
