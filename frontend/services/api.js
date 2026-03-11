/**
 * API Service for Pharmacy Bill App
 * Communicates with the backend server
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:5000/api';

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
};

// ============================================================================
// BILL API
// ============================================================================

export const billApi = {
  /**
   * Save parsed bill data to backend
   * Frontend handles OCR (ML Kit) and parsing (Gemini/Groq)
   * Backend just saves the data
   * @param {string} userId - User ID
   * @param {Object} parsedData - Parsed bill data from Gemini/Groq
   * @param {string} ocrText - Raw OCR text from ML Kit
   * @param {string} imageUri - Image URI
   * @returns {Promise} Response with saved bill info
   */
  saveBill: async (userId, parsedData, ocrText, imageUri) => {
    return apiFetch(`/bills/${userId}/save`, {
      method: 'POST',
      body: JSON.stringify({
        parsedData,
        ocrText,
        imageUri
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
  saveDraft: async (userId, parsedData, ocrText, imageUri) => {
    return apiFetch(`/bills/${userId}/draft`, {
      method: 'POST',
      body: JSON.stringify({ parsedData, ocrText, imageUri }),
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
  baseUrl: API_BASE_URL,
};
