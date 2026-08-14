/**
 * API Service for Pharmacy Bill App
 * Communicates with the backend server
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:5000/api';
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

/**
 * Resolve a relative storage path (e.g. "/uploads/payments/xxx.jpg") returned by the
 * backend into an absolute URL the RN <Image> component can load. Already-absolute
 * URLs are returned unchanged.
 */
export function getFileUrl(relativePath) {
  if (!relativePath) return null;
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  return `${API_ORIGIN}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
}

// DEBUG: Log the API URL on startup
console.log('[API Service] Initialized with URL:', API_BASE_URL);
console.log('[API Service] EXPO_PUBLIC_BACKEND_URL env:', process.env.EXPO_PUBLIC_BACKEND_URL);

/**
 * Helper function to handle fetch requests
 */
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  console.log(`[API Fetch] GET/POST ${endpoint} → ${url}`);
  
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
      throw new Error(data.error || `API Error: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error.message);
    throw error;
  }
}

/**
 * Helper function for file uploads
 */
async function apiUpload(endpoint, formData) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header - let browser set it with boundary
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
  /**
   * Send OTP to phone number
   */
  sendOtp: async (phone) => {
    return apiFetch('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },

  /**
   * Verify OTP and login/signup
   */
  verifyOtp: async (phone, otp, name = null, shopName = null) => {
    return apiFetch('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp, name, shopName }),
    });
  },

  /**
   * Resend OTP
   */
  resendOtp: async (phone) => {
    return apiFetch('/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },

  /**
   * Get user profile
   */
  getProfile: async (userId) => {
    return apiFetch(`/auth/profile/${userId}`);
  },

  /**
   * Update user profile
   */
  updateProfile: async (userId, data) => {
    return apiFetch(`/auth/profile/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

// ============================================================================
// USER API
// ============================================================================

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
  savePushToken: async (userId, expoPushToken) => {
    return apiFetch(`/users/${userId}/push-token`, {
      method: 'PUT',
      body: JSON.stringify({ expoPushToken }),
    });
  },
};

// ============================================================================
// BILL API
// ============================================================================

export const billApi = {
  /**
   * Parse a bill image on the backend with Vision AI.
   * Keeps OCR/AI models out of the mobile APK and lets the server choose
   * the best parser/fallbacks.
   */
  parseBillImage: async (imageUri, mimeType = 'image/jpeg') => {
    const extension = mimeType.includes('pdf') ? 'pdf' : mimeType.includes('png') ? 'png' : 'jpg';
    const formData = new FormData();

    formData.append('image', {
      uri: imageUri,
      name: `bill.${extension}`,
      type: mimeType,
    });

    const response = await apiUpload('/ai/parse-image', formData);
    console.log('[OCR/AI RESPONSE] Backend returned this data:', JSON.stringify(response, null, 2));
    console.log('[OCR EXTRACTED TEXT]', response.ocrText || 'No OCR text returned');
    console.log('[AI FILLED DATA]', JSON.stringify(response.data || {}, null, 2));
    return response;
  },

  /**
   * Save parsed bill data to backend
   * Image parsing happens on the backend; this endpoint persists reviewed data.
   * @param {string} userId - User ID
   * @param {Object} parsedData - Parsed bill data from backend Vision/AI
   * @param {string} ocrText - Optional raw OCR text, when available
   * @param {string} imageUri - Image URI
   * @returns {Promise} Response with saved bill info
   */
  saveBill: async (userId, parsedData, ocrText, imageUri, ocrEngine = 'vision-ai') => {
    return apiFetch(`/bills/${userId}/save`, {
      method: 'POST',
      body: JSON.stringify({
        parsedData,
        ocrText,
        imageUri,
        ocrEngine,
      }),
    });
  },

  /**
   * Get draft bill with OCR data
   */
  getBillDraft: async (billId) => {
    return apiFetch(`/bills/${billId}/draft`);
  },

  /**
   * Confirm bill and save to database
   * @param {string} billId - Bill ID
   * @param {Object} billData - Bill data with items, metadata
   */
  confirmBill: async (billId, billData) => {
    return apiFetch(`/bills/${billId}/confirm`, {
      method: 'POST',
      body: JSON.stringify(billData),
    });
  },

  /**
   * Save bill as draft (no product sync)
   */
  saveDraft: async (userId, parsedData, ocrText, imageUri, ocrEngine = 'vision-ai') => {
    return apiFetch(`/bills/${userId}/draft`, {
      method: 'POST',
      body: JSON.stringify({ parsedData, ocrText, imageUri, ocrEngine }),
    });
  },

  /**
   * Get all drafts for a user
   */
  getUserDrafts: async (userId) => {
    return apiFetch(`/bills/user/${userId}/drafts`);
  },

  /**
   * Convert a draft to a completed bill
   */
  convertDraft: async (billId, parsedData) => {
    return apiFetch(`/bills/${billId}/convert`, {
      method: 'POST',
      body: JSON.stringify({ parsedData }),
    });
  },

  /**
   * Get all bills for a user
   */
  getUserBills: async (userId) => {
    return apiFetch(`/bills/user/${userId}`);
  },

  /**
   * Get single bill by ID
   */
  getBillById: async (billId) => {
    return apiFetch(`/bills/${billId}`);
  },

  /**
   * Update bill metadata
   */
  updateBill: async (billId, billData) => {
    return apiFetch(`/bills/${billId}`, {
      method: 'PUT',
      body: JSON.stringify(billData),
    });
  },

  /**
   * Delete bill
   */
  deleteBill: async (billId) => {
    return apiFetch(`/bills/${billId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Add item to bill
   */
  addBillItem: async (billId, itemData) => {
    return apiFetch(`/bills/${billId}/items`, {
      method: 'POST',
      body: JSON.stringify(itemData),
    });
  },

  /**
   * Get all items for a bill
   */
  getBillItems: async (billId) => {
    return apiFetch(`/bills/${billId}/items`);
  },

  /**
   * Delete bill item
   */
  deleteBillItem: async (itemId) => {
    return apiFetch(`/bills/items/${itemId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Edit bill header (invoiceNumber, invoiceDate, dueDate, distributorId) — audit-logged.
   * Fast path for the most common edit: updateBillHeader(billId, { invoiceDate: '...' })
   */
  updateBillHeader: async (billId, changes) => {
    return apiFetch(`/bills/${billId}/header`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
  },

  /**
   * Edit a line item (batchNumber, expiryDate, quantity, mrp, rate) — propagates to the
   * linked ProductBatch, audit-logged. Response includes `warnings` (e.g. negative stock).
   */
  updateBillItemFields: async (itemId, changes) => {
    return apiFetch(`/bills/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
  },

  /**
   * Before/after audit trail for a bill (header + every line item edit)
   */
  getBillEditHistory: async (billId) => {
    return apiFetch(`/bills/${billId}/edit-history`);
  },
};

// ============================================================================
// HEALTH CHECK
// ============================================================================

export const healthApi = {
  /**
   * Check if backend is running
   */
  check: async () => {
    return apiFetch('/health');
  },
};

// ============================================================================
// PRODUCT API
// ============================================================================

export const productApi = {
  /**
   * Create a new product
   * @param {string} userId - User ID
   * @param {Object} productData - Product data
   */
  createProduct: async (userId, productData) => {
    return apiFetch(`/products/${userId}`, {
      method: 'POST',
      body: JSON.stringify(productData),
    });
  },

  /**
   * Get all products for a user (paginated)
   * @param {string} userId - User ID
   * @param {Object} options - Query options (page, limit, search, sortBy, sortOrder)
   */
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

  /**
   * Get products with batch/expiry/distributor info aggregated from BillItem
   * (search across name/batch/invoice, distributor + expiry-month + received-date filters)
   * @param {string} userId - User ID
   * @param {Object} options - { search, distributorIds, expiryMonth, receivedFrom, receivedTo, sort, page, limit }
   */
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

  /**
   * Search products for autocomplete
   * @param {string} userId - User ID
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @param {boolean} fuzzy - Use fuzzy matching
   */
  searchProducts: async (userId, query, limit = 10, fuzzy = false) => {
    const params = new URLSearchParams({
      q: query,
      limit: limit.toString(),
      fuzzy: fuzzy.toString(),
    });
    return apiFetch(`/products/${userId}/search?${params.toString()}`);
  },

  /**
   * Get single product by ID
   * @param {string} userId - User ID
   * @param {string} productId - Product ID
   */
  getProductById: async (userId, productId) => {
    return apiFetch(`/products/${userId}/${productId}`);
  },

  /**
   * Update a product
   * @param {string} userId - User ID
   * @param {string} productId - Product ID
   * @param {Object} productData - Data to update
   */
  updateProduct: async (userId, productId, productData) => {
    return apiFetch(`/products/${userId}/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(productData),
    });
  },

  /**
   * Delete a product
   * @param {string} userId - User ID
   * @param {string} productId - Product ID
   * @param {boolean} permanent - Hard delete if true
   */
  deleteProduct: async (userId, productId, permanent = false) => {
    const params = permanent ? '?permanent=true' : '';
    return apiFetch(`/products/${userId}/${productId}${params}`, {
      method: 'DELETE',
    });
  },

  /**
   * Heuristic duplicate-name suggestions to review (never auto-merged)
   * @param {string} userId - User ID
   */
  getMergeCandidates: async (userId) => {
    return apiFetch(`/products/${userId}/merge-candidates`);
  },

  /**
   * Merge a duplicate product into a survivor — batches move, references remap,
   * duplicate is archived (never deleted).
   * @param {string} userId - User ID
   * @param {string} survivorId - Product to keep
   * @param {string} duplicateId - Product to merge away
   */
  mergeProducts: async (userId, survivorId, duplicateId) => {
    return apiFetch(`/products/${userId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ survivorId, duplicateId }),
    });
  },

  /**
   * Get product statistics
   * @param {string} userId - User ID
   */
  getProductStats: async (userId) => {
    return apiFetch(`/products/${userId}/stats`);
  },

  /**
   * Find matching product for an item name
   * @param {string} userId - User ID
   * @param {string} itemName - Item name to match
   */
  matchProduct: async (userId, itemName) => {
    const params = new URLSearchParams({ name: itemName });
    return apiFetch(`/products/${userId}/match?${params.toString()}`);
  },

  /**
   * Sync products from bill items
   * @param {string} userId - User ID
   * @param {Array} items - Bill items to sync
   */
  syncFromBill: async (userId, items) => {
    return apiFetch(`/products/${userId}/sync`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },
};

// ============================================================================
// GSTIN LOOKUP API
// ============================================================================

export const gstinApi = {
  /**
   * Lookup GSTIN via Sandbox GST API - returns full business/distributor info
   * @param {string} gstin - 15 character GSTIN number
   * @returns {Promise} Response with business details and pre-formatted distributor data
   */
  lookupGstin: async (gstin) => {
    return apiFetch('/gstin/lookup', {
      method: 'POST',
      body: JSON.stringify({ gstin }),
    });
  },

  /**
   * Verify GSTIN via Cashfree API (legacy)
   * @param {string} gstin - GSTIN number
   * @param {string} businessName - Optional business name for matching
   */
  verifyGstin: async (gstin, businessName = null) => {
    return apiFetch('/gstin/verify', {
      method: 'POST',
      body: JSON.stringify({ gstin, businessName }),
    });
  },

  /**
   * Check GST service status
   */
  getStatus: async () => {
    return apiFetch('/gstin/status');
  },
};

// ============================================================================
// DISTRIBUTOR API
// ============================================================================

export const distributorApi = {
  /**
   * Get all distributors for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options (search, includeInactive, sortBy, sortOrder)
   */
  getDistributors: async (userId, options = {}) => {
    const params = new URLSearchParams();
    if (options.search) params.append('search', options.search);
    if (options.includeInactive) params.append('includeInactive', 'true');
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.sortOrder) params.append('sortOrder', options.sortOrder);
    
    const queryString = params.toString();
    return apiFetch(`/distributors/user/${userId}${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * Search distributors for autocomplete
   * @param {string} userId - User ID
   * @param {string} query - Search query
   */
  searchDistributors: async (userId, query) => {
    return apiFetch(`/distributors/user/${userId}/search?q=${encodeURIComponent(query)}`);
  },

  /**
   * Get single distributor by ID
   * @param {string} distributorId - Distributor ID
   */
  getDistributorById: async (distributorId) => {
    return apiFetch(`/distributors/${distributorId}`);
  },

  /**
   * Get bills for a distributor
   * @param {string} distributorId - Distributor ID
   * @param {Object} options - Query options (page, limit)
   */
  getDistributorBills: async (distributorId, options = {}) => {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);
    
    const queryString = params.toString();
    return apiFetch(`/distributors/${distributorId}/bills${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * Create a new distributor
   * @param {string} userId - User ID
   * @param {Object} data - Distributor data (name, phone, gstin, address, dlNumber)
   */
  createDistributor: async (userId, data) => {
    return apiFetch(`/distributors/user/${userId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update a distributor
   * @param {string} distributorId - Distributor ID
   * @param {Object} data - Data to update
   */
  updateDistributor: async (distributorId, data) => {
    return apiFetch(`/distributors/${distributorId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete a distributor (soft delete)
   * @param {string} distributorId - Distributor ID
   */
  deleteDistributor: async (distributorId) => {
    return apiFetch(`/distributors/${distributorId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Migrate existing pharmacyName to distributors
   * @param {string} userId - User ID
   */
  migratePharmacyNames: async (userId) => {
    return apiFetch(`/distributors/user/${userId}/migrate`, {
      method: 'POST',
    });
  },
};

// ============================================================================
// PAYMENT API - Track UPI payments to distributors
// ============================================================================

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

// ============================================================================
// INVOICE API - Customer sales invoices
// ============================================================================

export const invoiceApi = {
  /**
   * Get all invoices for a user
   * @param {string} userId - User ID
   */
  getInvoices: async (userId) => {
    return apiFetch(`/invoices/${userId}`);
  },

  /**
   * Create a new invoice
   * @param {string} userId - User ID
   * @param {Object} data - Invoice data
   */
  createInvoice: async (userId, data) => {
    return apiFetch(`/invoices/${userId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get a single invoice by ID
   * @param {string} userId - User ID
   * @param {string} invoiceId - Invoice ID
   */
  getInvoiceById: async (userId, invoiceId) => {
    return apiFetch(`/invoices/${userId}/${invoiceId}`);
  },

  /**
   * Delete/reverse an invoice (refunds stock)
   * @param {string} userId - User ID
   * @param {string} invoiceId - Invoice ID
   */
  deleteInvoice: async (userId, invoiceId) => {
    return apiFetch(`/invoices/${userId}/${invoiceId}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================================
// PATIENT API - Refill Reminders / Medication Sync
// ============================================================================

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

// ============================================================================
// LEDGER API — Distributor Payments (Khata)
// ============================================================================

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
   * Compress client-side before calling this.
   * @param {string} userId - User ID
   * @param {string} imageUri - Local image URI
   * @param {string} mimeType - image/jpeg | image/png | image/webp
   */
  uploadAttachment: async (userId, imageUri, mimeType = 'image/jpeg') => {
    const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    const formData = new FormData();
    formData.append('attachment', {
      uri: imageUri,
      name: `payment.${extension}`,
      type: mimeType,
    });
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

// Default export with all APIs
export default {
  auth: authApi,
  user: userApi,
  bill: billApi,
  health: healthApi,
  product: productApi,
  gstin: gstinApi,
  distributor: distributorApi,
  payment: paymentApi,
  ledger: ledgerApi,
  patient: patientApi,
  invoice: invoiceApi,
  baseUrl: API_BASE_URL,
};

// ============================================================================
// EXPIRY ACTION WINDOW API
// ============================================================================

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

// ============================================================================
// SALES API (Quick Sell + Daily Sale Register)
// ============================================================================

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

// ============================================================================
// PRODUCT BATCH API (batch-level stock)
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

// ============================================================================
// EXPORT API (Excel / CSV data export)
// ============================================================================

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
   * Generate an export and return it as base64 plus its server-chosen file name.
   *
   * The response is a binary file stream, not JSON, so this bypasses apiFetch.
   * Base64 is what expo-file-system needs to write the file to disk before it can
   * be handed to the native share sheet.
   *
   * @param {string} userId
   * @param {'purchases'|'expiry'|'sales'|'ledger'} type
   * @param {Object} filters
   * @param {'xlsx'|'csv'} format
   * @returns {Promise<{ base64: string, fileName: string, mimeType: string, rowCount: number }>}
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

    const fileName =
      response.headers.get('X-Export-File-Name') ||
      `Setu_Export.${format}`;
    const rowCount = parseInt(response.headers.get('X-Export-Row-Count'), 10) || 0;
    const mimeType = response.headers.get('Content-Type') || 'application/octet-stream';

    // React Native's fetch has no Buffer; go via arrayBuffer and encode manually
    const arrayBuffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);

    return { base64, fileName, mimeType, rowCount };
  },

  /**
   * Past exports (audit trail)
   * @param {string} userId
   */
  getHistory: async (userId, limit = 20) => {
    return apiFetch(`/exports/user/${userId}/history?limit=${limit}`);
  },
};

/**
 * Encode an ArrayBuffer as base64 without Buffer (unavailable in the RN runtime).
 * Chunked so a large workbook cannot blow the argument limit of String.fromCharCode.
 */
function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  // Hermes provides btoa; global.Buffer is the polyfill set up in global-polyfills.js
  if (global.btoa) return global.btoa(binary);
  return global.Buffer.from(binary, 'binary').toString('base64');
}
