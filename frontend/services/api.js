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
  verifyOtp: async (phone, otp, name = null) => {
    return apiFetch('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp, name }),
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

// Default export with all APIs
export default {
  auth: authApi,
  user: userApi,
  bill: billApi,
  health: healthApi,
  baseUrl: API_BASE_URL,
};
