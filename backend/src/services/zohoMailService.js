/**
 * Zoho Mail API Service
 * Handles all interactions with the Zoho Mail REST API
 * Docs: https://www.zoho.com/mail/help/api/
 */

const axios = require('axios');

const ZOHO_API_BASE = process.env.ZOHO_API_DOMAIN || 'https://mail.zoho.in';
const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.in';

/**
 * Get a fresh access token using the refresh token
 */
async function refreshAccessToken() {
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    console.warn('[ZohoMail] Missing refresh token credentials, using static access token');
    return process.env.ZOHO_ACCESS_TOKEN;
  }

  try {
    const tokenUrl = `${ZOHO_ACCOUNTS_URL}/oauth/v2/token`;
    console.log(`[ZohoMail] Refreshing token via: ${tokenUrl}`);
    
    const response = await axios.post(tokenUrl, null, {
      params: {
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      },
    });

    // Log the FULL response so we can see scopes, errors, etc.
    console.log('[ZohoMail] Token refresh response:', JSON.stringify(response.data, null, 2));

    if (response.data && response.data.access_token) {
      process.env.ZOHO_ACCESS_TOKEN = response.data.access_token;
      console.log('[ZohoMail] ✓ Access token refreshed successfully');
      // Log token prefix for debugging (first 20 chars only)
      console.log(`[ZohoMail] Token starts with: ${response.data.access_token.substring(0, 20)}...`);
      if (response.data.scope) {
        console.log(`[ZohoMail] Token scopes: ${response.data.scope}`);
      }
      return response.data.access_token;
    } else {
      console.error('[ZohoMail] ✗ Token refresh failed - no access_token in response:', response.data);
      return process.env.ZOHO_ACCESS_TOKEN;
    }
  } catch (error) {
    console.error('[ZohoMail] ✗ Token refresh error:', error.response?.data || error.message);
    return process.env.ZOHO_ACCESS_TOKEN;
  }
}

/**
 * Track whether we've refreshed the token this session
 */
let tokenRefreshedThisSession = false;

/**
 * Get Zoho API headers with authorization
 * Proactively refreshes the token on first call of each session
 */
async function getHeaders() {
  if (!tokenRefreshedThisSession) {
    const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;
    if (refreshToken && clientId && clientSecret) {
      console.log('[ZohoMail] Proactively refreshing access token...');
      await refreshAccessToken();
      tokenRefreshedThisSession = true;
    }
  }

  let token = process.env.ZOHO_ACCESS_TOKEN;
  return {
    Authorization: `Zoho-oauthtoken ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Make an authenticated API call, retrying once with a refreshed token on 401
 */
async function zohoApiCall(method, url, data = null) {
  let headers = await getHeaders();
  
  // Debug: log the URL being called
  console.log(`[ZohoMail] API Call: ${method} ${url}`);
  
  try {
    const response = await axios({ method, url, headers, data, timeout: 30000 });
    return response.data;
  } catch (error) {
    // Debug: log full error details
    console.error(`[ZohoMail] API Error: ${error.response?.status} ${error.response?.statusText}`);
    console.error(`[ZohoMail] Error URL: ${url}`);
    if (error.response?.data) {
      console.error(`[ZohoMail] Error Body:`, JSON.stringify(error.response.data).substring(0, 500));
    }
    if (error.response?.headers) {
      const rateLimitHeaders = {};
      for (const [key, val] of Object.entries(error.response.headers)) {
        if (key.toLowerCase().includes('ratelimit') || key.toLowerCase().includes('x-zoho')) {
          rateLimitHeaders[key] = val;
        }
      }
      if (Object.keys(rateLimitHeaders).length > 0) {
        console.error('[ZohoMail] Zoho Headers:', JSON.stringify(rateLimitHeaders));
      }
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
      console.log('[ZohoMail] Token expired, refreshing...');
      tokenRefreshedThisSession = false; // Reset so next getHeaders() refreshes
      const newToken = await refreshAccessToken();
      headers.Authorization = `Zoho-oauthtoken ${newToken}`;
      
      console.log(`[ZohoMail] Retrying: ${method} ${url}`);
      const retryResponse = await axios({ method, url, headers, data, timeout: 30000 });
      return retryResponse.data;
    }
    throw error;
  }
}

/**
 * Fetch the Zoho Mail account ID (if not already configured)
 */
async function getAccountId() {
  const configuredId = process.env.ZOHO_ACCOUNT_ID;
  if (configuredId) {
    console.log(`[ZohoMail] Using configured Account ID: ${configuredId}`);
    return configuredId;
  }

  const result = await zohoApiCall('GET', `${ZOHO_API_BASE}/api/accounts`);
  if (result?.data && result.data.length > 0) {
    const accountId = result.data[0].accountId;
    process.env.ZOHO_ACCOUNT_ID = accountId;
    console.log(`[ZohoMail] ✓ Account ID resolved: ${accountId}`);
    return accountId;
  }
  throw new Error('No Zoho Mail accounts found');
}

/**
 * Fetch emails from inbox
 * Uses messages/view endpoint directly (works with ZohoMail.messages.READ scope).
 * Each message in the response includes its folderId, so we don't need to
 * call the folders endpoint (which requires ZohoMail.folders.READ scope).
 * 
 * @param {number} limit - Max emails to fetch (default 50)
 * @param {string} folderId - Folder ID (omit to fetch from all folders)
 * @returns {Array} List of email objects
 */
async function fetchEmails(limit = 50, folderId = null) {
  const accountId = await getAccountId();
  
  // Use provided folderId or env setting if available, otherwise fetch all messages
  let targetFolderId = folderId || process.env.ZOHO_EMAIL_FOLDER_ID;

  // Build URL - works without folderId (returns messages from all folders)
  const url = targetFolderId
    ? `${ZOHO_API_BASE}/api/accounts/${accountId}/messages/view?folderId=${targetFolderId}&limit=${limit}`
    : `${ZOHO_API_BASE}/api/accounts/${accountId}/messages/view?limit=${limit}`;

  console.log(`[ZohoMail] Fetching messages from: ${url}`);
  const result = await zohoApiCall('GET', url);
  console.log(`[ZohoMail] ✓ Fetched ${result?.data?.length || 0} emails`);
  return result?.data || [];
}

/**
 * Search emails with a query (e.g., "invoice", "bill")
 * @param {string} searchKey - Search keyword
 * @param {number} limit - Max results
 */
async function searchEmails(searchKey = 'invoice', limit = 50) {
  const accountId = await getAccountId();
  const url = `${ZOHO_API_BASE}/api/accounts/${accountId}/messages/search?searchKey=${encodeURIComponent(searchKey)}&limit=${limit}`;
  const result = await zohoApiCall('GET', url);
  console.log(`[ZohoMail] ✓ Search for "${searchKey}" returned ${result?.data?.length || 0} results`);
  return result?.data || [];
}

/**
 * Get email details (including attachment info)
 * Zoho API requires /details suffix on message URL
 * @param {string} messageId - Zoho message ID
 * @param {string} folderId - Zoho folder ID (required by API)
 */
async function getEmailDetails(messageId, folderId) {
  const accountId = await getAccountId();
  const url = `${ZOHO_API_BASE}/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/details`;
  const result = await zohoApiCall('GET', url);
  return result?.data || null;
}

/**
 * Download an attachment as a Buffer
 * @param {string} messageId - Zoho message ID
 * @param {string} attachmentId - Attachment ID
 * @param {string} folderId - Folder ID
 * @returns {Buffer} File contents
 */
async function downloadAttachment(messageId, attachmentId, folderId) {
  const accountId = await getAccountId();
  const url = `${ZOHO_API_BASE}/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/attachments/${attachmentId}`;

  let token = process.env.ZOHO_ACCESS_TOKEN;
  try {
    const response = await axios({
      method: 'GET',
      url,
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    console.log(`[ZohoMail] ✓ Downloaded attachment ${attachmentId} (${Math.round(response.data.length / 1024)}KB)`);
    return Buffer.from(response.data);
  } catch (error) {
    if (error.response?.status === 401) {
      token = await refreshAccessToken();
      const retryResponse = await axios({
        method: 'GET',
        url,
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
        responseType: 'arraybuffer',
        timeout: 60000,
      });
      return Buffer.from(retryResponse.data);
    }
    throw error;
  }
}

/**
 * Get the full email body content (HTML/text)
 * @param {string} messageId - Zoho message ID
 * @param {string} folderId - Folder ID
 * @returns {Object} { content, summary }
 */
async function getEmailContent(messageId, folderId) {
  const accountId = await getAccountId();
  const url = `${ZOHO_API_BASE}/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/content`;
  try {
    const result = await zohoApiCall('GET', url);
    return result?.data || null;
  } catch (error) {
    console.warn(`[ZohoMail] ⚠ Failed to get email content: ${error.message}`);
    return null;
  }
}

/**
 * Mark an email as read
 * @param {string} messageId - Zoho message ID
 * @param {string} folderId - Folder ID
 */
async function markAsRead(messageId, folderId) {
  const accountId = await getAccountId();
  const url = `${ZOHO_API_BASE}/api/accounts/${accountId}/updatemessage`;
  try {
    await zohoApiCall('PUT', url, {
      messageId: [messageId],
      mode: 'markAsRead',
      folderId,
    });
    console.log(`[ZohoMail] ✓ Marked message ${messageId} as read`);
  } catch (error) {
    console.warn(`[ZohoMail] ⚠ Failed to mark as read: ${error.message}`);
  }
}

module.exports = {
  refreshAccessToken,
  getAccountId,
  fetchEmails,
  searchEmails,
  getEmailDetails,
  getEmailContent,
  downloadAttachment,
  markAsRead,
};
