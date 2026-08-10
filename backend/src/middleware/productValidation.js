/**
 * Product Validation Middleware
 * Validates product-related request data
 */

const VALID_SCHEDULE_FLAGS = ['none', 'h1', 'nrx'];

/**
 * Shared checks for the pack/unit definition and the regulatory schedule flag.
 * packSize drives every pack<->base-unit conversion, so a bad value silently corrupts
 * stock math — it is validated strictly rather than coerced.
 */
function validatePackAndSchedule(body) {
  const errors = [];

  if (body.packSize !== undefined && body.packSize !== null && body.packSize !== '') {
    const packSize = Number(body.packSize);
    if (!Number.isInteger(packSize)) {
      errors.push('Pack size must be a whole number of base units');
    } else if (packSize < 1) {
      errors.push('Pack size must be at least 1');
    } else if (packSize > 100000) {
      errors.push('Pack size exceeds maximum allowed value');
    }
  }

  if (body.scheduleFlag !== undefined && body.scheduleFlag !== null && body.scheduleFlag !== '') {
    if (!VALID_SCHEDULE_FLAGS.includes(String(body.scheduleFlag).toLowerCase())) {
      errors.push(`Schedule must be one of: ${VALID_SCHEDULE_FLAGS.join(', ')}`);
    }
  }

  for (const field of ['baseUnit', 'packLabel']) {
    if (body[field] && String(body[field]).length > 40) {
      errors.push(`${field} must be less than 40 characters`);
    }
  }

  return errors;
}

/**
 * Validate create product request
 */
exports.validateCreateProduct = (req, res, next) => {
  const { name, defaultRate, defaultMrp, gstPercent } = req.body;
  const errors = [];

  // Name is required
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Product name is required');
  } else if (name.trim().length > 255) {
    errors.push('Product name must be less than 255 characters');
  }

  // Validate defaultRate
  if (defaultRate !== undefined && defaultRate !== null) {
    const rate = parseFloat(defaultRate);
    if (isNaN(rate)) {
      errors.push('Rate must be a valid number');
    } else if (rate < 0) {
      errors.push('Rate cannot be negative');
    } else if (rate > 1000000) {
      errors.push('Rate exceeds maximum allowed value');
    }
  }

  // Validate defaultMrp
  if (defaultMrp !== undefined && defaultMrp !== null) {
    const mrp = parseFloat(defaultMrp);
    if (isNaN(mrp)) {
      errors.push('MRP must be a valid number');
    } else if (mrp < 0) {
      errors.push('MRP cannot be negative');
    } else if (mrp > 1000000) {
      errors.push('MRP exceeds maximum allowed value');
    }
  }

  // Validate gstPercent
  if (gstPercent !== undefined && gstPercent !== null) {
    const gst = parseFloat(gstPercent);
    if (isNaN(gst)) {
      errors.push('GST percentage must be a valid number');
    } else if (gst < 0 || gst > 100) {
      errors.push('GST percentage must be between 0 and 100');
    }
  }

  // Validate manufacturer length
  if (req.body.manufacturer && req.body.manufacturer.length > 255) {
    errors.push('Manufacturer name must be less than 255 characters');
  }

  // Validate HSN code
  if (req.body.hsnCode && req.body.hsnCode.length > 20) {
    errors.push('HSN code must be less than 20 characters');
  }

  errors.push(...validatePackAndSchedule(req.body));

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

/**
 * Validate update product request
 */
exports.validateUpdateProduct = (req, res, next) => {
  const { name, defaultRate, defaultMrp, gstPercent } = req.body;
  const errors = [];

  // Name validation (if provided)
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      errors.push('Product name cannot be empty');
    } else if (name.trim().length > 255) {
      errors.push('Product name must be less than 255 characters');
    }
  }

  // Validate defaultRate
  if (defaultRate !== undefined && defaultRate !== null) {
    const rate = parseFloat(defaultRate);
    if (isNaN(rate)) {
      errors.push('Rate must be a valid number');
    } else if (rate < 0) {
      errors.push('Rate cannot be negative');
    } else if (rate > 1000000) {
      errors.push('Rate exceeds maximum allowed value');
    }
  }

  // Validate defaultMrp
  if (defaultMrp !== undefined && defaultMrp !== null) {
    const mrp = parseFloat(defaultMrp);
    if (isNaN(mrp)) {
      errors.push('MRP must be a valid number');
    } else if (mrp < 0) {
      errors.push('MRP cannot be negative');
    } else if (mrp > 1000000) {
      errors.push('MRP exceeds maximum allowed value');
    }
  }

  // Validate gstPercent
  if (gstPercent !== undefined && gstPercent !== null) {
    const gst = parseFloat(gstPercent);
    if (isNaN(gst)) {
      errors.push('GST percentage must be a valid number');
    } else if (gst < 0 || gst > 100) {
      errors.push('GST percentage must be between 0 and 100');
    }
  }

  // Validate manufacturer length
  if (req.body.manufacturer && req.body.manufacturer.length > 255) {
    errors.push('Manufacturer name must be less than 255 characters');
  }

  // Validate HSN code
  if (req.body.hsnCode && req.body.hsnCode.length > 20) {
    errors.push('HSN code must be less than 20 characters');
  }

  errors.push(...validatePackAndSchedule(req.body));

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

/**
 * Validate search query
 */
exports.validateSearchQuery = (req, res, next) => {
  const { q, limit } = req.query;

  if (limit !== undefined) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({ 
        error: 'Limit must be between 1 and 100' 
      });
    }
  }

  next();
};

/**
 * Validate pagination parameters
 */
exports.validatePagination = (req, res, next) => {
  const { page, limit } = req.query;

  if (page !== undefined) {
    const pageNum = parseInt(page);
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({ 
        error: 'Page must be a positive integer' 
      });
    }
  }

  if (limit !== undefined) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({ 
        error: 'Limit must be between 1 and 100' 
      });
    }
  }

  next();
};

/**
 * Validate user ID in params
 */
exports.validateUserId = (req, res, next) => {
  const { userId } = req.params;

  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    return res.status(400).json({ 
      error: 'User ID is required' 
    });
  }

  next();
};

/**
 * Validate product ID in params
 */
exports.validateProductId = (req, res, next) => {
  const { productId } = req.params;

  if (!productId || typeof productId !== 'string' || productId.trim().length === 0) {
    return res.status(400).json({ 
      error: 'Product ID is required' 
    });
  }

  next();
};
