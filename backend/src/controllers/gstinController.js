/**
 * GSTIN Controller
 * Handles GST Identification Number verification using Sandbox GST API
 * and legacy Cashfree API as fallback
 */

const axios = require('axios');

// Sandbox GST API configuration
const SANDBOX_API_KEY = process.env.SANDBOX_GST_API_KEY || 'key_live_d4c6d54005c142b3b6bd81f23f26206b';
const SANDBOX_BASE_URL = 'https://api.sandbox.co.in';

// Cashfree API configuration (legacy fallback)
const CASHFREE_BASE_URL = process.env.CASHFREE_ENV === 'production' 
  ? 'https://api.cashfree.com/verification'
  : 'https://sandbox.cashfree.com/verification';

const CASHFREE_CLIENT_ID = process.env.CASHFREE_CLIENT_ID;
const CASHFREE_CLIENT_SECRET = process.env.CASHFREE_CLIENT_SECRET;

/**
 * Lookup GSTIN using Sandbox GST API - returns full distributor info
 * POST /api/gstin/lookup
 * Body: { gstin }
 */
exports.lookupGstin = async (req, res) => {
  try {
    const { gstin } = req.body;

    // Validation
    if (!gstin) {
      return res.status(400).json({
        success: false,
        error: 'GSTIN is required'
      });
    }

    // GSTIN format validation (15 characters alphanumeric)
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstinRegex.test(gstin.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid GSTIN format. GSTIN should be 15 characters (e.g., 29AAICP2912R1ZR)'
      });
    }

    const normalizedGstin = gstin.toUpperCase().trim();
    console.log(`[GSTIN] Looking up GSTIN via Sandbox API: ${normalizedGstin}`);

    // Call Sandbox GST API
    const response = await axios.get(
      `${SANDBOX_BASE_URL}/gsp/tax-payer/gstin/${normalizedGstin}`,
      {
        headers: {
          'Authorization': SANDBOX_API_KEY,
          'x-api-key': SANDBOX_API_KEY,
          'x-api-version': '1.0',
          'Accept': 'application/json',
        },
        timeout: 15000 // 15 second timeout
      }
    );

    const result = response.data;

    // Check if the API returned valid data
    if (!result || !result.data) {
      return res.status(200).json({
        success: true,
        valid: false,
        message: 'GSTIN not found or inactive',
        gstin: normalizedGstin
      });
    }

    const data = result.data;

    // Build full address from parts
    const addressParts = [];
    if (data.pradr?.adr) {
      const adr = data.pradr.adr;
      if (adr.bno) addressParts.push(adr.bno);
      if (adr.flno) addressParts.push(adr.flno);
      if (adr.bnm) addressParts.push(adr.bnm);
      if (adr.st) addressParts.push(adr.st);
      if (adr.loc) addressParts.push(adr.loc);
      if (adr.city) addressParts.push(adr.city);
      if (adr.dst) addressParts.push(adr.dst);
      if (adr.stcd) addressParts.push(adr.stcd);
      if (adr.pncd) addressParts.push(adr.pncd);
    }

    const fullAddress = addressParts.join(', ');
    const tradeName = data.tradeNam || '';
    const legalName = data.lgnm || '';
    const businessName = tradeName || legalName;

    // Return formatted distributor-ready data
    return res.status(200).json({
      success: true,
      valid: true,
      message: 'GSTIN lookup successful',
      data: {
        gstin: data.gstin || normalizedGstin,
        legalName: legalName,
        tradeName: tradeName,
        businessName: businessName,
        registrationDate: data.rgdt || '',
        status: data.sts || '',
        taxpayerType: data.dty || '',
        constitution: data.ctb || '',

        // Address information
        address: {
          full: fullAddress,
          building: data.pradr?.adr?.bnm || '',
          street: data.pradr?.adr?.st || '',
          location: data.pradr?.adr?.loc || '',
          city: data.pradr?.adr?.city || data.pradr?.adr?.dst || '',
          district: data.pradr?.adr?.dst || '',
          state: data.pradr?.adr?.stcd || '',
          pincode: data.pradr?.adr?.pncd || '',
        },

        // Jurisdiction
        centerJurisdiction: data.ctj || '',
        stateJurisdiction: data.stj || '',

        // Business activities
        businessActivities: data.nba || [],

        // Nature of core business
        coreBusinessActivity: data.pradr?.ntr || '',

        // Last update date
        lastUpdateDate: data.lstupdt || '',

        // For distributor creation - pre-formatted fields
        distributor: {
          name: businessName,
          gstin: data.gstin || normalizedGstin,
          address: fullAddress,
          phone: '', // GST API doesn't provide phone
          dlNumber: '', // GST API doesn't provide DL number
          email: '', // GST API doesn't provide email
        }
      }
    });

  } catch (error) {
    console.error('[GSTIN] Sandbox API lookup error:', error.message);

    // Handle API errors
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;

      if (status === 401 || status === 403) {
        return res.status(503).json({
          success: false,
          error: 'GST lookup service authentication failed',
          details: 'Invalid API key'
        });
      }

      if (status === 404) {
        return res.status(200).json({
          success: true,
          valid: false,
          message: 'GSTIN not found in GST records',
          gstin: req.body.gstin?.toUpperCase()
        });
      }

      if (status === 429) {
        return res.status(429).json({
          success: false,
          error: 'Too many requests. Please try again in a moment.'
        });
      }

      return res.status(500).json({
        success: false,
        error: errorData?.message || 'GSTIN lookup failed',
        details: errorData
      });
    }

    // Network or timeout error
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return res.status(504).json({
        success: false,
        error: 'GST lookup service timeout. Please try again.'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to lookup GSTIN',
      details: error.message
    });
  }
};

/**
 * Verify GSTIN using Cashfree API (legacy)
 * POST /api/gstin/verify
 * Body: { gstin, businessName }
 */
exports.verifyGstin = async (req, res) => {
  try {
    const { gstin, businessName } = req.body;

    // Validation
    if (!gstin) {
      return res.status(400).json({
        success: false,
        error: 'GSTIN is required'
      });
    }

    // GSTIN format validation (15 characters alphanumeric)
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstinRegex.test(gstin)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid GSTIN format. GSTIN should be 15 characters (e.g., 29AAICP2912R1ZR)'
      });
    }

    // Check if Cashfree credentials are configured
    if (!CASHFREE_CLIENT_ID || !CASHFREE_CLIENT_SECRET) {
      console.error('[GSTIN] Cashfree credentials not configured');
      return res.status(503).json({
        success: false,
        error: 'GSTIN verification service not configured. Please contact administrator.',
        details: 'Cashfree API credentials missing in environment variables'
      });
    }

    // Prepare request body
    const requestBody = {
      GSTIN: gstin
    };

    // Add business name if provided (optional parameter for better matching)
    if (businessName && businessName.trim()) {
      requestBody.business_name = businessName.trim().toUpperCase();
    }

    console.log(`[GSTIN] Verifying GSTIN: ${gstin}`);

    // Call Cashfree API
    const response = await axios.post(
      `${CASHFREE_BASE_URL}/gstin`,
      requestBody,
      {
        headers: {
          'x-client-id': CASHFREE_CLIENT_ID,
          'x-client-secret': CASHFREE_CLIENT_SECRET,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      }
    );

    // Extract data from Cashfree response
    const data = response.data;

    // Check if GSTIN is valid
    if (!data.valid) {
      return res.status(200).json({
        success: true,
        valid: false,
        message: data.message || 'GSTIN not found or inactive',
        gstin: gstin
      });
    }

    // Return verified GSTIN details
    return res.status(200).json({
      success: true,
      valid: true,
      message: 'GSTIN verified successfully',
      data: {
        gstin: data.GSTIN,
        legalName: data.legal_name_of_business,
        tradeName: data.trade_name_of_business,
        businessName: data.trade_name_of_business || data.legal_name_of_business,
        registrationDate: data.date_of_registration,
        status: data.gst_in_status,
        taxpayerType: data.taxpayer_type,
        constitution: data.constitution_of_business,
        
        // Address information
        address: {
          full: data.principal_place_address,
          building: data.principal_place_split_address?.building_name || '',
          location: data.principal_place_split_address?.location || '',
          street: data.principal_place_split_address?.street || '',
          city: data.principal_place_split_address?.city || data.principal_place_split_address?.district || '',
          state: data.principal_place_split_address?.state || '',
          pincode: data.principal_place_split_address?.pincode || '',
        },
        
        // Jurisdiction
        centerJurisdiction: data.center_jurisdiction,
        stateJurisdiction: data.state_jurisdiction,
        
        // Business activities
        businessActivities: data.nature_of_business_activities || [],
        
        // Additional info
        lastUpdateDate: data.last_update_date,
        referenceId: data.reference_id
      }
    });

  } catch (error) {
    console.error('[GSTIN] Verification error:', error.message);

    // Handle Cashfree API errors
    if (error.response) {
      // API returned an error response
      const status = error.response.status;
      const errorData = error.response.data;

      if (status === 401) {
        return res.status(503).json({
          success: false,
          error: 'GSTIN verification service authentication failed',
          details: 'Invalid API credentials'
        });
      }

      if (status === 404) {
        return res.status(200).json({
          success: true,
          valid: false,
          message: 'GSTIN not found',
          gstin: req.body.gstin
        });
      }

      return res.status(500).json({
        success: false,
        error: errorData.message || 'GSTIN verification failed',
        details: errorData
      });
    }

    // Network or timeout error
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return res.status(504).json({
        success: false,
        error: 'GSTIN verification service timeout. Please try again.'
      });
    }

    // Other errors
    return res.status(500).json({
      success: false,
      error: 'Failed to verify GSTIN',
      details: error.message
    });
  }
};

/**
 * Get verification status (health check)
 * GET /api/gstin/status
 */
exports.getStatus = async (req, res) => {
  try {
    const sandboxConfigured = !!SANDBOX_API_KEY;
    const cashfreeConfigured = !!(CASHFREE_CLIENT_ID && CASHFREE_CLIENT_SECRET);
    
    res.json({
      success: true,
      sandboxConfigured,
      cashfreeConfigured,
      environment: process.env.CASHFREE_ENV || 'sandbox',
      message: sandboxConfigured 
        ? 'GST lookup service is ready (Sandbox API)' 
        : cashfreeConfigured
          ? 'GSTIN verification service is ready (Cashfree)'
          : 'GST services not configured'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check service status'
    });
  }
};
