/**
 * GSTIN Controller
 * Handles GST Identification Number verification using Cashfree API
 */

const axios = require('axios');

// Cashfree API configuration
const CASHFREE_BASE_URL = process.env.CASHFREE_ENV === 'production' 
  ? 'https://api.cashfree.com/verification'
  : 'https://sandbox.cashfree.com/verification';

const CASHFREE_CLIENT_ID = process.env.CASHFREE_CLIENT_ID;
const CASHFREE_CLIENT_SECRET = process.env.CASHFREE_CLIENT_SECRET;

/**
 * Verify GSTIN using Cashfree API
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
    const configured = !!(CASHFREE_CLIENT_ID && CASHFREE_CLIENT_SECRET);
    
    res.json({
      success: true,
      configured,
      environment: process.env.CASHFREE_ENV || 'sandbox',
      message: configured 
        ? 'GSTIN verification service is ready' 
        : 'GSTIN verification service not configured'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check service status'
    });
  }
};
