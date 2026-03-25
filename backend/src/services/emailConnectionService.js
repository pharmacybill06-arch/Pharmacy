const prisma = require('../models/prisma');

const DEFAULT_PROVIDER = 'zoho';
const DEFAULT_AUTH_TYPE = 'imap_password';

function maskSecret(value) {
  if (!value) return null;
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function getProviderDefaults(provider = DEFAULT_PROVIDER) {
  const normalized = String(provider || DEFAULT_PROVIDER).toLowerCase();

  if (normalized === 'gmail') {
    return {
      provider: 'gmail',
      authType: DEFAULT_AUTH_TYPE,
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      imapSecure: true,
      mailbox: 'INBOX',
    };
  }

  if (normalized === 'zoho') {
    return {
      provider: 'zoho',
      authType: DEFAULT_AUTH_TYPE,
      imapHost: 'imap.zoho.in',
      imapPort: 993,
      imapSecure: true,
      mailbox: 'INBOX',
    };
  }

  return {
    provider: normalized,
    authType: DEFAULT_AUTH_TYPE,
    imapHost: null,
    imapPort: 993,
    imapSecure: true,
    mailbox: 'INBOX',
  };
}

function toConnectionSummary(connection) {
  if (!connection) return null;

  return {
    id: connection.id,
    userId: connection.userId,
    provider: connection.provider,
    authType: connection.authType || DEFAULT_AUTH_TYPE,
    emailAddress: connection.emailAddress,
    displayName: connection.displayName,
    imapHost: connection.imapHost,
    imapPort: connection.imapPort,
    imapSecure: connection.imapSecure,
    mailbox: connection.mailbox,
    folderId: connection.folderId,
    isActive: connection.isActive,
    hasPassword: !!connection.password,
    passwordPreview: maskSecret(connection.password),
    lastSyncedAt: connection.lastSyncedAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

function buildEnvFallback(userId) {
  const providerDefaults = getProviderDefaults(process.env.EMAIL_PROVIDER || process.env.ZOHO_PROVIDER || DEFAULT_PROVIDER);
  const hasImapCredential = !!(
    process.env.EMAIL_ADDRESS ||
    process.env.ZOHO_EMAIL_ADDRESS ||
    process.env.EMAIL_PASSWORD ||
    process.env.ZOHO_APP_PASSWORD
  );

  if (!hasImapCredential) {
    return null;
  }

  return {
    id: null,
    userId,
    provider: providerDefaults.provider,
    authType: DEFAULT_AUTH_TYPE,
    emailAddress: process.env.EMAIL_ADDRESS || process.env.ZOHO_EMAIL_ADDRESS || null,
    displayName: process.env.EMAIL_DISPLAY_NAME || process.env.ZOHO_DISPLAY_NAME || null,
    password: process.env.EMAIL_PASSWORD || process.env.ZOHO_APP_PASSWORD || null,
    imapHost: process.env.EMAIL_IMAP_HOST || providerDefaults.imapHost,
    imapPort: process.env.EMAIL_IMAP_PORT ? parseInt(process.env.EMAIL_IMAP_PORT, 10) : providerDefaults.imapPort,
    imapSecure: process.env.EMAIL_IMAP_SECURE
      ? process.env.EMAIL_IMAP_SECURE !== 'false'
      : providerDefaults.imapSecure,
    mailbox: process.env.EMAIL_MAILBOX || providerDefaults.mailbox,
    folderId: process.env.EMAIL_MAILBOX || providerDefaults.mailbox,
    isActive: true,
    source: 'env',
  };
}

async function getUserEmailConnection(userId, options = {}) {
  const { allowEnvFallback = true } = options;

  if (!userId) {
    throw new Error('userId is required to resolve email connection');
  }

  const connection = await prisma.emailInboxConnection.findFirst({
    where: {
      userId,
      isActive: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  if (connection) {
    return { ...connection, source: 'database' };
  }

  if (allowEnvFallback) {
    const fallback = buildEnvFallback(userId);
    if (fallback) {
      return fallback;
    }
  }

  throw new Error('No active email inbox connection found for this user');
}

async function upsertUserEmailConnection(userId, payload) {
  if (!userId) {
    throw new Error('userId is required');
  }

  const defaults = getProviderDefaults(payload.provider || DEFAULT_PROVIDER);
  const data = {
    provider: payload.provider || defaults.provider,
    authType: payload.authType || defaults.authType,
    emailAddress: payload.emailAddress || null,
    displayName: payload.displayName || null,
    password: payload.password || null,
    imapHost: payload.imapHost || defaults.imapHost,
    imapPort: payload.imapPort !== undefined && payload.imapPort !== null && payload.imapPort !== ''
      ? parseInt(payload.imapPort, 10)
      : defaults.imapPort,
    imapSecure: payload.imapSecure !== undefined ? !!payload.imapSecure : defaults.imapSecure,
    mailbox: payload.mailbox || defaults.mailbox,
    folderId: payload.folderId || payload.mailbox || defaults.mailbox,
    accountId: null,
    accessToken: null,
    refreshToken: null,
    clientId: null,
    clientSecret: null,
    apiDomain: '',
    accountsBaseUrl: '',
    isActive: payload.isActive !== undefined ? !!payload.isActive : true,
    tokenUpdatedAt: null,
  };

  const existing = await prisma.emailInboxConnection.findFirst({
    where: {
      userId,
      provider: data.provider,
    },
  });

  const connection = existing
    ? await prisma.emailInboxConnection.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.emailInboxConnection.create({
        data: {
          ...data,
          user: {
            connect: { id: userId },
          },
        },
      });

  return toConnectionSummary(connection);
}

async function touchConnectionSync(connectionId) {
  if (!connectionId) return;

  await prisma.emailInboxConnection.update({
    where: { id: connectionId },
    data: { lastSyncedAt: new Date() },
  });
}

module.exports = {
  DEFAULT_PROVIDER,
  DEFAULT_AUTH_TYPE,
  getProviderDefaults,
  getUserEmailConnection,
  upsertUserEmailConnection,
  touchConnectionSync,
  toConnectionSummary,
};
