/**
 * GSTIN Controller
 * Handles GST Identification Number verification using ClearTax public API
 * and legacy Cashfree API as fallback
 * Uses native fetch (Node 18+) — no axios dependency needed
 */

// ClearTax GST lookup (free, no auth needed)
const CLEARTAX_BASE_URL = 'https://cleartax.in/f/compliance-report';

// Cashfree API configuration (legacy fallback)
const CASHFREE_BASE_URL = process.env.CASHFREE_ENV === 'production' 
  ? 'https://api.cashfree.com/verification'
  : 'https://sandbox.cashfree.com/verification';

const CASHFREE_CLIENT_ID = process.env.CASHFREE_CLIENT_ID;
const CASHFREE_CLIENT_SECRET = process.env.CASHFREE_CLIENT_SECRET;

/**
 * Lookup GSTIN using ClearTax public API - returns full distributor info
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
    console.log(`[GSTIN] Looking up GSTIN via ClearTax API: ${normalizedGstin}`);

    // Call ClearTax public API using native fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response;
    try {
      response = await fetch(
        `${CLEARTAX_BASE_URL}/${normalizedGstin}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle non-2xx HTTP responses
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error('[GSTIN] ClearTax API error:', response.status, errorBody);
      if (response.status === 404) {
        return res.status(200).json({
          success: true,
          valid: false,
          message: 'GSTIN not found in GST records',
          gstin: normalizedGstin
        });
      }
      if (response.status === 429) {
        return res.status(429).json({
          success: false,
          error: 'Too many requests. Please try again in a moment.'
        });
      }
      return res.status(500).json({
        success: false,
        error: 'GSTIN lookup failed',
        details: errorBody
      });
    }

    const result = await response.json();

    // ClearTax returns data in result.taxpayerInfo (or result directly for some GSTINs)
    const data = result.taxpayerInfo || result;

    // Check if the API returned valid data
    if (!data || !data.gstin) {
      return res.status(200).json({
        success: true,
        valid: false,
        message: 'GSTIN not found or inactive',
        gstin: normalizedGstin
      });
    }

    // ClearTax uses pradr.addr (not pradr.adr) for address fields
    const addr = data.pradr?.addr || data.pradr?.adr || {};

    // Build full address from parts
    const addressParts = [];
    if (addr.bno) addressParts.push(addr.bno);
    if (addr.flno) addressParts.push(addr.flno);
    if (addr.bnm) addressParts.push(addr.bnm);
    if (addr.st) addressParts.push(addr.st);
    if (addr.loc) addressParts.push(addr.loc);
    if (addr.city) addressParts.push(addr.city);
    if (addr.dst) addressParts.push(addr.dst);
    if (addr.stcd) addressParts.push(addr.stcd);
    if (addr.pncd) addressParts.push(addr.pncd);

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
          building: addr.bnm || '',
          street: addr.st || '',
          location: addr.loc || '',
          city: addr.city || addr.dst || '',
          district: addr.dst || '',
          state: addr.stcd || '',
          pincode: addr.pncd || '',
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
    console.error('[GSTIN] ClearTax API lookup error:', error.message);

    // AbortController timeout
    if (error.name === 'AbortError') {
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

    // Call Cashfree API using native fetch
    const cfController = new AbortController();
    const cfTimeoutId = setTimeout(() => cfController.abort(), 10000);

    let cfResponse;
    try {
      cfResponse = await fetch(
        `${CASHFREE_BASE_URL}/gstin`,
        {
          method: 'POST',
          headers: {
            'x-client-id': CASHFREE_CLIENT_ID,
            'x-client-secret': CASHFREE_CLIENT_SECRET,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: cfController.signal,
        }
      );
    } finally {
      clearTimeout(cfTimeoutId);
    }

    // Handle non-2xx responses
    if (!cfResponse.ok) {
      const errorBody = await cfResponse.json().catch(() => ({}));
      if (cfResponse.status === 401) {
        return res.status(503).json({
          success: false,
          error: 'GSTIN verification service authentication failed',
          details: 'Invalid API credentials'
        });
      }
      if (cfResponse.status === 404) {
        return res.status(200).json({
          success: true,
          valid: false,
          message: 'GSTIN not found',
          gstin: req.body.gstin
        });
      }
      return res.status(500).json({
        success: false,
        error: errorBody?.message || 'GSTIN verification failed',
        details: errorBody
      });
    }

    // Extract data from Cashfree response
    const data = await cfResponse.json();

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

    // AbortController timeout
    if (error.name === 'AbortError') {
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
    const cashfreeConfigured = !!(CASHFREE_CLIENT_ID && CASHFREE_CLIENT_SECRET);
    
    res.json({
      success: true,
      clearTaxConfigured: true, // ClearTax is free, no config needed
      cashfreeConfigured,
      environment: process.env.CASHFREE_ENV || 'sandbox',
      message: 'GST lookup service is ready (ClearTax API)'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check service status'
    });
  }
};
