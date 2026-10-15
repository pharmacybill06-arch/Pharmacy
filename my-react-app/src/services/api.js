/**
 * API Service for Pharmacy Bill App (Web)
 * Communicates with the backend server
 */

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000/api';

console.log('[API Service] Initialized with URL:', API_BASE_URL);

async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      // Mirrors frontend/services/api.js: prefer the server's human-readable `message`
      // and carry status + body so callers can handle a specific case (e.g. the
      // duplicate-invoice 409) instead of only having a string to match on.
      const error = new Error(data.message || data.error || `API Error: ${response.status}`);
      error.status = response.status;
      error.code = data.error;
      error.details = data;
      throw error;
    }

    return data;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error.message);
    throw error;
  }
}

async function apiUpload(endpoint, formData) {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Upload Error: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`Upload Error [${endpoint}]:`, error.message);
    throw error;
  }
}

// ============================================================================
// AUTH API
// ============================================================================
export const authApi = {
  sendOtp: async (phone) => {
    return apiFetch('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },

  verifyOtp: async (phone, otp, name = null, shopName = null) => {
    return apiFetch('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp, name, shopName }),
    });
  },

  resendOtp: async (phone) => {
    return apiFetch('/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },

  getProfile: async (userId) => {
    return apiFetch(`/auth/profile/${userId}`);
  },

  updateProfile: async (userId, data) => {
    return apiFetch(`/auth/profile/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

// ============================================================================
// BILL API
// ============================================================================
export const billApi = {
  saveBill: async (userId, parsedData, ocrText, imageUri) => {
    return apiFetch(`/bills/${userId}/save`, {
      method: 'POST',
      body: JSON.stringify({ parsedData, ocrText, imageUri }),
    });
  },

  /**
   * Bills for a user, newest-first by the date printed ON the bill (not upload time).
   * @param {string} userId
   * @param {string} [search] - invoice number, partial and separator-insensitive
   */
  getUserBills: async (userId, search) => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiFetch(`/bills/user/${userId}${qs}`);
  },

  getBillById: async (billId) => {
    return apiFetch(`/bills/${billId}`);
  },

  updateBill: async (billId, billData) => {
    return apiFetch(`/bills/${billId}`, {
      method: 'PUT',
      body: JSON.stringify(billData),
    });
  },

  /**
   * What deleting this bill would do — item count and the stock lines that would be
   * reversed. Used to state the consequence in the confirm dialog.
   */
  getBillDeleteImpact: async (billId) => {
    return apiFetch(`/bills/${billId}/delete-impact`);
  },

  deleteBill: async (billId) => {
    return apiFetch(`/bills/${billId}`, { method: 'DELETE' });
  },

  addBillItem: async (billId, itemData) => {
    return apiFetch(`/bills/${billId}/items`, {
      method: 'POST',
      body: JSON.stringify(itemData),
    });
  },

  getBillItems: async (billId) => {
    return apiFetch(`/bills/${billId}/items`);
  },

  deleteBillItem: async (itemId) => {
    return apiFetch(`/bills/items/${itemId}`, { method: 'DELETE' });
  },

  // ========== DRAFT ENDPOINTS ==========
  saveDraft: async (userId, parsedData, ocrText, imageUri) => {
    return apiFetch(`/bills/${userId}/draft`, {
      method: 'POST',
      body: JSON.stringify({ parsedData, ocrText, imageUri }),
    });
  },

  getUserDrafts: async (userId) => {
    return apiFetch(`/bills/user/${userId}/drafts`);
  },

  convertDraft: async (billId, parsedData) => {
    return apiFetch(`/bills/${billId}/convert`, {
      method: 'POST',
      body: JSON.stringify({ parsedData }),
    });
  },
  confirmBill: async (billId, billData) => {
    return apiFetch(`/bills/${billId}/confirm`, {
      method: 'POST',
      body: JSON.stringify(billData),
    });
  },
  getBillDraft: async (billId) => {
    return apiFetch(`/bills/${billId}/draft`);
  },
  getBillEditHistory: async (billId) => {
    return apiFetch(`/bills/${billId}/edit-history`);
  },
  updateBillHeader: async (billId, changes) => {
    return apiFetch(`/bills/${billId}/header`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
  },
  updateBillItemFields: async (itemId, changes) => {
    return apiFetch(`/bills/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
  },
};

// ============================================================================
// PRODUCT API
// ============================================================================
export const productApi = {
  createProduct: async (userId, productData) => {
    return apiFetch(`/products/${userId}`, {
      method: 'POST',
      body: JSON.stringify(productData),
    });
  },

  getProducts: async (userId, options = {}) => {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);
    if (options.search) params.append('search', options.search);
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.sortOrder) params.append('sortOrder', options.sortOrder);
    if (options.activeOnly !== undefined) params.append('activeOnly', options.activeOnly);

    const queryString = params.toString();
    return apiFetch(`/products/${userId}${queryString ? `?${queryString}` : ''}`);
  },

  searchProducts: async (userId, query, limit = 10, fuzzy = false) => {
    const params = new URLSearchParams({
      q: query,
      limit: limit.toString(),
      fuzzy: fuzzy.toString(),
    });
    return apiFetch(`/products/${userId}/search?${params.toString()}`);
  },

  getProductById: async (userId, productId) => {
    return apiFetch(`/products/${userId}/${productId}`);
  },

  updateProduct: async (userId, productId, productData) => {
    return apiFetch(`/products/${userId}/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(productData),
    });
  },

  deleteProduct: async (userId, productId, permanent = false) => {
    const params = permanent ? '?permanent=true' : '';
    return apiFetch(`/products/${userId}/${productId}${params}`, { method: 'DELETE' });
  },

  getProductStats: async (userId) => {
    return apiFetch(`/products/${userId}/stats`);
  },

  syncFromBill: async (userId, items) => {
    return apiFetch(`/products/${userId}/sync`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },
  getEnrichedProducts: async (userId, options = {}) => {
    const params = new URLSearchParams();
    if (options.search) params.append('search', options.search);
    if (options.distributorIds?.length) params.append('distributorIds', options.distributorIds.join(','));
    if (options.expiryMonth) params.append('expiryMonth', options.expiryMonth);
    if (options.receivedFrom) params.append('receivedFrom', options.receivedFrom);
    if (options.receivedTo) params.append('receivedTo', options.receivedTo);
    if (options.sort) params.append('sort', options.sort);
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);

    const queryString = params.toString();
    return apiFetch(`/products/${userId}/list-enriched${queryString ? `?${queryString}` : ''}`);
  },
  getMergeCandidates: async (userId) => {
    return apiFetch(`/products/${userId}/merge-candidates`);
  },
  identifyProduct: async (userId, productId) => {
    return apiFetch(`/products/${userId}/${productId}/identify`);
  },
  matchProduct: async (userId, itemName) => {
    const params = new URLSearchParams({ name: itemName });
    return apiFetch(`/products/${userId}/match?${params.toString()}`);
  },
  mergeProducts: async (userId, survivorId, duplicateId) => {
    return apiFetch(`/products/${userId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ survivorId, duplicateId }),
    });
  },
};

// ============================================================================
// INVOICE API
// ============================================================================
export const invoiceApi = {
  createInvoice: async (userId, invoiceData) => {
    return apiFetch(`/invoices/${userId}`, {
      method: 'POST',
      body: JSON.stringify(invoiceData),
    });
  },

  getInvoices: async (userId, options = {}) => {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);
    if (options.search) params.append('search', options.search);

    const queryString = params.toString();
    return apiFetch(`/invoices/${userId}${queryString ? `?${queryString}` : ''}`);
  },

  getInvoiceById: async (userId, invoiceId) => {
    return apiFetch(`/invoices/${userId}/${invoiceId}`);
  },

  updateInvoice: async (userId, invoiceId, data) => {
    return apiFetch(`/invoices/${userId}/${invoiceId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteInvoice: async (userId, invoiceId) => {
    return apiFetch(`/invoices/${userId}/${invoiceId}`, { method: 'DELETE' });
  },

  getStats: async (userId) => {
    return apiFetch(`/invoices/${userId}/stats`);
  },
};

// ============================================================================
// DISTRIBUTOR API
// ============================================================================
export const distributorApi = {
  getDistributors: async (userId, options = {}) => {
    const params = new URLSearchParams();
    if (options.search) params.append('search', options.search);
    if (options.includeInactive) params.append('includeInactive', 'true');
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.sortOrder) params.append('sortOrder', options.sortOrder);

    const queryString = params.toString();
    return apiFetch(`/distributors/user/${userId}${queryString ? `?${queryString}` : ''}`);
  },

  searchDistributors: async (userId, query) => {
    return apiFetch(`/distributors/user/${userId}/search?q=${encodeURIComponent(query)}`);
  },

  getDistributorById: async (distributorId) => {
    return apiFetch(`/distributors/${distributorId}`);
  },

  getDistributorBills: async (distributorId, options = {}) => {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);

    const queryString = params.toString();
    return apiFetch(`/distributors/${distributorId}/bills${queryString ? `?${queryString}` : ''}`);
  },

  createDistributor: async (userId, data) => {
    return apiFetch(`/distributors/user/${userId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateDistributor: async (distributorId, data) => {
    return apiFetch(`/distributors/${distributorId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteDistributor: async (distributorId) => {
    return apiFetch(`/distributors/${distributorId}`, { method: 'DELETE' });
  },
};

// ============================================================================
// GSTIN API
// ============================================================================
export const gstinApi = {
  lookupGstin: async (gstin) => {
    return apiFetch('/gstin/lookup', {
      method: 'POST',
      body: JSON.stringify({ gstin }),
    });
  },

  getStatus: async () => {
    return apiFetch('/gstin/status');
  },
};

// ============================================================================
// AI API
// ============================================================================
export const aiApi = {
  parseOcr: async (ocrText) => {
    return apiFetch('/ai/parse-ocr', {
      method: 'POST',
      body: JSON.stringify({ ocrText }),
    });
  },
  parseImage: async (imageFile, ocrText = '') => {
    const formData = new FormData();
    formData.append('image', imageFile);
    if (ocrText) {
      formData.append('ocrText', ocrText);
    }
    return apiUpload('/ai/parse-image', formData);
  },
  /** High-accuracy OCR using OCR.space. Set parseWithAI=true to also get parsed data. */
  ocrImage: async (imageFile, parseWithAI = false) => {
    const formData = new FormData();
    formData.append('image', imageFile);
    if (parseWithAI) {
      formData.append('parseWithAI', 'true');
    }
    return apiUpload('/ai/ocr', formData);
  },
  getMedicineDetails: async (name) => {
    return apiFetch('/ai/medicine-details', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  },
};

// ============================================================================
// HEALTH CHECK
// ============================================================================
// EMAIL BILL API
// ============================================================================
export const emailBillApi = {
  getConnection: async (userId) => {
    return apiFetch(`/email-bills/connection?userId=${encodeURIComponent(userId)}`);
  },
  saveConnection: async (payload) => {
    return apiFetch('/email-bills/connection', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  // ===== NEW: Smart email processing =====
  listInbox: async (userId, limit = 30, search = '') => {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    if (limit) params.append('limit', limit);
    if (search) params.append('search', search);
    return apiFetch(`/email-bills/inbox?${params.toString()}`);
  },
  processSelected: async (userId, emails) => {
    return apiFetch('/email-bills/process-selected', {
      method: 'POST',
      body: JSON.stringify({ userId, emails }),
    });
  },
  extractFromEmail: async (userId, messageId, folderId) => {
    return apiFetch('/email-bills/extract', {
      method: 'POST',
      body: JSON.stringify({ userId, messageId, folderId }),
    });
  },
  checkDuplicate: async (userId, invoiceNumber) => {
    return apiFetch('/email-bills/check-duplicate', {
      method: 'POST',
      body: JSON.stringify({ userId, invoiceNumber }),
    });
  },
  // ===== Legacy =====
  fetchAndProcess: async (userId, limit = 20) => {
    return apiFetch('/email-bills/fetch', {
      method: 'POST',
      body: JSON.stringify({ userId, limit }),
    });
  },
  getLogs: async (userId, page = 1, limit = 50) => {
    return apiFetch(`/email-bills/logs?userId=${encodeURIComponent(userId)}&page=${page}&limit=${limit}`);
  },
  getLogDetails: async (userId, logId) => {
    return apiFetch(`/email-bills/logs/${logId}?userId=${encodeURIComponent(userId)}`);
  },
  retryEmail: async (logId, userId) => {
    return apiFetch(`/email-bills/retry/${logId}`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },
};

// ============================================================================
// HEALTH API
// ============================================================================
export const healthApi = {
  check: async () => {
    return apiFetch('/health');
  },
};

const api = {
  auth: authApi,
  bill: billApi,
  product: productApi,
  invoice: invoiceApi,
  distributor: distributorApi,
  gstin: gstinApi,
  ai: aiApi,
  emailBill: emailBillApi,
  health: healthApi,
  baseUrl: API_BASE_URL,
};

export default api;


/**
 * The register is a wall-clock day at the counter, but saleDate is stored as a true
 * instant. Sending the device's UTC offset keeps a 12:30am sale on the day the
 * pharmacist actually made it.
 */
function tzOffsetMinutes() {
  return -new Date().getTimezoneOffset();
}

/** Local YYYY-MM-DD (never the UTC date, which can be a day off). */
export function todayLocalIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// ============================================================================
// MODULES SHARED WITH THE MOBILE APP
// ----------------------------------------------------------------------------
// Ported from frontend/services/api.js so the web client can reach the same
// backend capabilities as the phone. Keep the two in step — see
// WEB_MOBILE_PARITY.md. Two methods differ by necessity and are marked inline:
// ledgerApi.uploadAttachment (File vs RN uri descriptor) and exportApi.generate
// (Blob download vs base64 for expo-file-system).
// ============================================================================

export const batchApi = {
  /**
   * Batches for a product in FEFO order (earliest expiry first) with remaining qty.
   * Empty batches are included — the pharmacist must see every batch on the shelf.
   * @param {string} userId
   * @param {string} productId
   */
  getProductBatches: async (userId, productId, includeArchived = false) => {
    const qs = includeArchived ? '?includeArchived=true' : '';
    return apiFetch(`/products/${userId}/${productId}/batches${qs}`);
  },

  /**
   * Create or update a batch by hand (user override — always available)
   * @param {string} userId
   * @param {string} productId
   * @param {Object} data - { batchNumber, expiryDate?, quantityBase?, mrp?, purchaseRate? }
   */
  upsertBatch: async (userId, productId, data) => {
    return apiFetch(`/products/${userId}/${productId}/batches`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Archive a batch (never delete)
   * @param {string} userId
   * @param {string} batchId
   */
  archiveBatch: async (userId, batchId, isArchived = true) => {
    return apiFetch(`/products/${userId}/batches/${batchId}/archive`, {
      method: 'POST',
      body: JSON.stringify({ isArchived }),
    });
  },
};

export const expiryApi = {
  /**
   * Get batches inside the action window (expiring within windowDays)
   * @param {string} userId
   * @param {number} windowDays - configurable, default 90
   */
  getWindow: async (userId, windowDays = 90) => {
    return apiFetch(`/expiry/user/${userId}/window?windowDays=${windowDays}`);
  },

  /**
   * Apply an action to a batch
   * @param {string} itemId
   * @param {'update_qty'|'sold'|'returned'|'writeoff'} action
   * @param {number} [remainingQty]
   */
  applyAction: async (itemId, action, remainingQty) => {
    return apiFetch(`/expiry/items/${itemId}/action`, {
      method: 'PATCH',
      body: JSON.stringify({ action, remainingQty }),
    });
  },

  /**
   * Get archived items
   * @param {string} userId
   */
  getArchive: async (userId) => {
    return apiFetch(`/expiry/user/${userId}/archive`);
  },
};

export const ledgerApi = {
  /**
   * Screen A — all distributors with outstanding/overdue totals, sorted highest first
   * @param {string} userId - User ID
   */
  getSummary: async (userId) => {
    return apiFetch(`/ledger/user/${userId}/summary`);
  },

  /**
   * Home screen alert: total overdue across all distributors
   * @param {string} userId - User ID
   */
  getOverdueAlert: async (userId) => {
    return apiFetch(`/ledger/user/${userId}/overdue-alert`);
  },

  /**
   * Screen B — distributor ledger detail: bills, payments, and the chronological statement
   * @param {string} distributorId - Distributor ID
   */
  getDistributorLedger: async (distributorId) => {
    return apiFetch(`/ledger/distributor/${distributorId}`);
  },

  /**
   * Flow C, step 5 — allocation targets (opening balance + unpaid/partial bills, oldest first)
   * @param {string} distributorId - Distributor ID
   */
  getAllocationTargets: async (distributorId) => {
    return apiFetch(`/ledger/distributor/${distributorId}/allocation-targets`);
  },

  /**
   * Upload a payment attachment (UPI screenshot or photographed receipt/cheque/credit note).
   *
   * Web takes a real File/Blob from an <input type="file">, unlike the mobile app which
   * appends React Native's { uri, name, type } descriptor. Same endpoint, same response.
   *
   * @param {string} userId - User ID
   * @param {File|Blob} file - The image chosen by the user
   * @param {string} mimeType - image/jpeg | image/png | image/webp
   */
  uploadAttachment: async (userId, file, mimeType = 'image/jpeg') => {
    const type = file?.type || mimeType;
    const extension = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    const formData = new FormData();
    formData.append('attachment', file, file?.name || `payment.${extension}`);
    return apiUpload(`/ledger/user/${userId}/upload-attachment`, formData);
  },

  /**
   * Flow C — record a payment for a distributor.
   * Omit `allocations` for FIFO auto-allocation; pass [] to skip allocation ("Adjust later").
   * @param {string} userId - User ID
   * @param {string} distributorId - Distributor ID
   * @param {Object} data - { amount, paymentDate, mode, referenceNumber, attachmentPath, attachmentSource, notes, allocations?, force? }
   */
  recordPayment: async (userId, distributorId, data) => {
    return apiFetch(`/ledger/user/${userId}/distributor/${distributorId}/payments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Edit a payment. If reducing amount below its allocated total, pass a new `allocations` plan.
   * @param {string} paymentId - Payment ID
   * @param {Object} data - Fields to update
   */
  updatePayment: async (paymentId, data) => {
    return apiFetch(`/ledger/payments/${paymentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Archive a payment (never hard-deleted)
   * @param {string} paymentId - Payment ID
   */
  archivePayment: async (paymentId) => {
    return apiFetch(`/ledger/payments/${paymentId}/archive`, { method: 'POST' });
  },

  /**
   * Restore an archived payment
   * @param {string} paymentId - Payment ID
   */
  unarchivePayment: async (paymentId) => {
    return apiFetch(`/ledger/payments/${paymentId}/unarchive`, { method: 'POST' });
  },

  /**
   * Archived payments filter view
   * @param {string} userId - User ID
   */
  getArchivedPayments: async (userId) => {
    return apiFetch(`/ledger/user/${userId}/archived-payments`);
  },

  /**
   * Edit a distributor's opening balance (with an audit note)
   * @param {string} distributorId - Distributor ID
   * @param {Object} data - { openingBalance, note }
   */
  updateOpeningBalance: async (distributorId, data) => {
    return apiFetch(`/ledger/distributor/${distributorId}/opening-balance`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

export const salesApi = {
  /**
   * Record a sale. Items may name their batch explicitly (pharmacist override) or omit
   * it for server-side FEFO with auto-split.
   * @param {string} userId
   * @param {Object} data - { items: [{ productId, productBatchId?, quantityBase, pricePerBase? }],
   *                          customerName?, doctorName?, customerPhone?, totalAmount?, saleDate?, notes? }
   */
  createSale: async (userId, data) => {
    return apiFetch(`/sales/user/${userId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Daily Sale Register for one day
   * @param {string} userId
   * @param {string} date - YYYY-MM-DD (defaults to today in the device's timezone)
   */
  getDailyRegister: async (userId, date) => {
    const params = new URLSearchParams({
      date: date || todayLocalIso(),
      tzOffsetMinutes: String(tzOffsetMinutes()),
    });
    return apiFetch(`/sales/user/${userId}?${params.toString()}`);
  },

  /**
   * Cross-date sale history for a medicine — "koi bhi day ki medicine dekh sakein"
   * @param {string} userId
   * @param {string} product - medicine name query
   */
  searchSales: async (userId, product) => {
    return apiFetch(`/sales/user/${userId}/search?product=${encodeURIComponent(product)}`);
  },

  /**
   * Convert-to-bill queue: quick (unbilled) sales, oldest first
   * @param {string} userId
   */
  getPendingSales: async (userId) => {
    return apiFetch(`/sales/user/${userId}/pending`);
  },

  /**
   * Schedule H1/NRX register (the view a drug inspector asks for)
   * @param {string} userId
   * @param {Object} range - { from?, to? } ISO dates
   */
  getScheduleRegister: async (userId, range = {}) => {
    const params = new URLSearchParams();
    if (range.from) params.append('from', range.from);
    if (range.to) params.append('to', range.to);
    const qs = params.toString();
    return apiFetch(`/sales/user/${userId}/schedule-register${qs ? `?${qs}` : ''}`);
  },

  /**
   * Preview how a quantity will be drawn from batches (the FEFO split shown before save)
   * @param {string} productId
   * @param {number} quantityBase
   * @param {string} [preferredBatchId] - pharmacist's override
   */
  previewAllocation: async (productId, quantityBase, preferredBatchId = null) => {
    const params = new URLSearchParams({ productId, quantityBase: String(quantityBase) });
    if (preferredBatchId) params.append('preferredBatchId', preferredBatchId);
    return apiFetch(`/sales/preview-allocation?${params.toString()}`);
  },

  /**
   * Get a single sale
   * @param {string} saleId
   */
  getSaleById: async (saleId) => {
    return apiFetch(`/sales/${saleId}`);
  },

  /**
   * Convert a quick sale to a Bill. Batch/quantity are locked; only prices and
   * customer fields are editable.
   * @param {string} saleId
   * @param {Object} data - { customerName?, customerPhone?, doctorName?, invoiceNumber?,
   *                          items?: [{ saleItemId, pricePerBase }], totalAmount? }
   */
  convertToBill: async (saleId, data = {}) => {
    return apiFetch(`/sales/${saleId}/convert-to-bill`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Archive a sale (restores its stock). There is no delete — archive only.
   * @param {string} saleId
   */
  archiveSale: async (saleId) => {
    return apiFetch(`/sales/${saleId}/archive`, { method: 'POST' });
  },

  /**
   * Restore an archived sale (deducts its stock again)
   * @param {string} saleId
   */
  unarchiveSale: async (saleId) => {
    return apiFetch(`/sales/${saleId}/unarchive`, { method: 'POST' });
  },
};

export const patientApi = {
  /**
   * Get all patients for a user, sorted by soonest medicine run-out
   * @param {string} userId - User ID
   */
  getPatients: async (userId) => {
    return apiFetch(`/patients/${userId}`);
  },

  /**
   * Get a single patient with computed days-of-supply and sync recommendation
   * @param {string} userId - User ID
   * @param {string} patientId - Patient ID
   */
  getPatientById: async (userId, patientId) => {
    return apiFetch(`/patients/${userId}/${patientId}`);
  },

  /**
   * Create a new patient (optionally with initial medicines[])
   * @param {string} userId - User ID
   * @param {Object} data - { name, phone, notes, medicines }
   */
  createPatient: async (userId, data) => {
    return apiFetch(`/patients/${userId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update patient name/phone/notes
   * @param {string} userId - User ID
   * @param {string} patientId - Patient ID
   * @param {Object} data - Fields to update
   */
  updatePatient: async (userId, patientId, data) => {
    return apiFetch(`/patients/${userId}/${patientId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete a patient (soft delete)
   * @param {string} userId - User ID
   * @param {string} patientId - Patient ID
   */
  deletePatient: async (userId, patientId) => {
    return apiFetch(`/patients/${userId}/${patientId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Add a medicine to a patient
   * @param {string} userId - User ID
   * @param {string} patientId - Patient ID
   * @param {Object} data - { name, stripsDispensed, tabletsPerStrip, dosePerDay }
   */
  addMedicine: async (userId, patientId, data) => {
    return apiFetch(`/patients/${userId}/${patientId}/medicines`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update a patient's medicine
   * @param {string} userId - User ID
   * @param {string} patientId - Patient ID
   * @param {string} medicineId - Medicine ID
   * @param {Object} data - Fields to update
   */
  updateMedicine: async (userId, patientId, medicineId, data) => {
    return apiFetch(`/patients/${userId}/${patientId}/medicines/${medicineId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Remove a medicine from a patient
   * @param {string} userId - User ID
   * @param {string} patientId - Patient ID
   * @param {string} medicineId - Medicine ID
   */
  deleteMedicine: async (userId, patientId, medicineId) => {
    return apiFetch(`/patients/${userId}/${patientId}/medicines/${medicineId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Confirm pickup — resets the cycle from the actual pickup date
   * @param {string} userId - User ID
   * @param {string} patientId - Patient ID
   * @param {Array} medicines - [{ medicineId, stripsDispensed?, tabletsPerStrip?, dosePerDay? }]
   */
  confirmPickup: async (userId, patientId, medicines) => {
    return apiFetch(`/patients/${userId}/${patientId}/confirm-pickup`, {
      method: 'POST',
      body: JSON.stringify({ medicines }),
    });
  },

  /**
   * Send a refill reminder (mock channel in v1 — logs only)
   * @param {string} userId - User ID
   * @param {string} patientId - Patient ID
   */
  sendReminder: async (userId, patientId) => {
    return apiFetch(`/patients/${userId}/${patientId}/send-reminder`, {
      method: 'POST',
    });
  },
};

export const userApi = {
  /**
   * Create a new user
   */
  createUser: async (userData) => {
    return apiFetch('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  /**
   * Get all users
   */
  getAllUsers: async () => {
    return apiFetch('/users');
  },

  /**
   * Get user by ID
   */
  getUserById: async (userId) => {
    return apiFetch(`/users/${userId}`);
  },

  /**
   * Update user
   */
  updateUser: async (userId, userData) => {
    return apiFetch(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  },

  /**
   * Delete user
   */
  deleteUser: async (userId) => {
    return apiFetch(`/users/${userId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Save this device's Expo push token, used for refill-reminder alerts
   */
};

export const exportApi = {
  /**
   * Row count before generating, e.g. "142 items from 9 bills"
   * @param {string} userId
   * @param {'purchases'|'expiry'|'sales'|'ledger'} type
   * @param {Object} filters
   */
  preview: async (userId, type, filters = {}) => {
    return apiFetch(`/exports/user/${userId}/preview`, {
      method: 'POST',
      body: JSON.stringify({ type, filters }),
    });
  },

  /**
   * Generate an export and hand the browser a file download.
   *
   * The response is a binary stream, not JSON, so this bypasses apiFetch. The mobile app
   * returns base64 for expo-file-system to write to disk; on web we get a Blob and drive
   * an <a download> click instead.
   *
   * @param {string} userId
   * @param {'purchases'|'expiry'|'sales'|'ledger'} type
   * @param {Object} filters
   * @param {'xlsx'|'csv'} format
   * @returns {Promise<{ fileName: string, mimeType: string, rowCount: number }>}
   */
  generate: async (userId, type, filters = {}, format = 'xlsx') => {
    const url = `${API_BASE_URL}/exports/user/${userId}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, filters, format }),
    });

    if (!response.ok) {
      // Errors still come back as JSON — surface the server's message, which
      // distinguishes "No data in this range" from a real failure
      let message = `Export failed: ${response.status}`;
      let code = null;
      try {
        const error = await response.json();
        message = error.error || message;
        code = error.code || null;
      } catch {
        // Non-JSON error body; keep the status-based message
      }
      const err = new Error(message);
      err.code = code;
      throw err;
    }

    const fileName = response.headers.get('X-Export-File-Name') || `Setu_Export.${format}`;
    const rowCount = parseInt(response.headers.get('X-Export-Row-Count'), 10) || 0;
    const mimeType = response.headers.get('Content-Type') || 'application/octet-stream';

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoke on the next tick so the download has started.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);

    return { fileName, mimeType, rowCount };
  },

  /**
   * Past exports (audit trail)
   * @param {string} userId
   */
  getHistory: async (userId, limit = 20) => {
    return apiFetch(`/exports/user/${userId}/history?limit=${limit}`);
  },
};

export const paymentApi = {
  /**
   * Get all payments for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options (distributorId, paymentApp, startDate, endDate, page, limit)
   */
  getPayments: async (userId, options = {}) => {
    const params = new URLSearchParams();
    if (options.distributorId) params.append('distributorId', options.distributorId);
    if (options.paymentApp) params.append('paymentApp', options.paymentApp);
    if (options.paymentStatus) params.append('paymentStatus', options.paymentStatus);
    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.sortOrder) params.append('sortOrder', options.sortOrder);
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);

    const queryString = params.toString();
    return apiFetch(`/payments/user/${userId}${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * Get payment stats for a user
   * @param {string} userId - User ID
   */
  getPaymentStats: async (userId) => {
    return apiFetch(`/payments/user/${userId}/stats`);
  },

  /**
   * Create a new payment from shared UPI receipt
   * @param {string} userId - User ID
   * @param {Object} data - Payment data
   */
  createPayment: async (userId, data) => {
    return apiFetch(`/payments/user/${userId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Auto-match distributor from payee name
   * @param {string} userId - User ID
   * @param {string} payeeName - Payee name from UPI receipt
   */
  matchDistributor: async (userId, payeeName) => {
    return apiFetch(`/payments/user/${userId}/match-distributor`, {
      method: 'POST',
      body: JSON.stringify({ payeeName }),
    });
  },

  /**
   * Get payments for a specific distributor
   * @param {string} distributorId - Distributor ID
   * @param {Object} options - Query options (page, limit)
   */
  getDistributorPayments: async (distributorId, options = {}) => {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);

    const queryString = params.toString();
    return apiFetch(`/payments/distributor/${distributorId}${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * Get a single payment by ID
   * @param {string} paymentId - Payment ID
   */
  getPaymentById: async (paymentId) => {
    return apiFetch(`/payments/${paymentId}`);
  },

  /**
   * Update a payment (link distributor, add notes)
   * @param {string} paymentId - Payment ID
   * @param {Object} data - Update data
   */
  updatePayment: async (paymentId, data) => {
    return apiFetch(`/payments/${paymentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete a payment
   * @param {string} paymentId - Payment ID
   */
  deletePayment: async (paymentId) => {
    return apiFetch(`/payments/${paymentId}`, {
      method: 'DELETE',
    });
  },
};
