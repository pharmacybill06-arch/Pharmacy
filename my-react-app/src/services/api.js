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
      throw new Error(data.error || `API Error: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error.message);
    throw error;
  }
}

// eslint-disable-next-line no-unused-vars
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

  getUserBills: async (userId) => {
    return apiFetch(`/bills/user/${userId}`);
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
};

// ============================================================================
// HEALTH CHECK
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
  health: healthApi,
  baseUrl: API_BASE_URL,
};

export default api;
