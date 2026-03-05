const prisma = require('../models/prisma');

// Retry wrapper for Prisma operations that may fail due to connection drops
async function withRetry(fn, retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isConnectionError = 
        error.message?.includes('Server has closed the connection') ||
        error.message?.includes('Can\'t reach database server') ||
        error.message?.includes('Connection timed out') ||
        error.message?.includes('ECONNRESET') ||
        error.message?.includes('ECONNREFUSED') ||
        error.code === 'P1001' || // Can't reach database server
        error.code === 'P1002' || // Database server timed out
        error.code === 'P1017' || // Server has closed the connection
        error.code === 'P2024';   // Timed out fetching connection from pool

      if (isConnectionError && attempt < retries) {
        console.warn(`[Prisma] Connection error on attempt ${attempt}/${retries}, retrying in ${delay}ms...`);
        // Attempt to reconnect
        try { await prisma.$disconnect(); } catch (_) {}
        try { await prisma.$connect(); } catch (_) {}
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }
      throw error;
    }
  }
}

// Generate a 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// OTP expiry time in minutes
const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 3;

/**
 * Send OTP to phone number
 * In production, integrate with SMS gateway (Twilio, AWS SNS, etc.)
 */
exports.sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    // Validate phone number
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Basic phone validation (10 digits for India)
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number. Please enter a valid 10-digit mobile number.' });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Delete any existing OTPs for this phone + create new one (with retry for connection drops)
    await withRetry(async () => {
      await prisma.otp.deleteMany({
        where: { phone }
      });

      await prisma.otp.create({
        data: {
          phone,
          otp,
          expiresAt
        }
      });
    });

    // In production, send OTP via SMS gateway here
    // For development, we'll log it and return success
    console.log(`[OTP] Phone: ${phone}, OTP: ${otp} (expires in ${OTP_EXPIRY_MINUTES} minutes)`);

    // Check if user exists
    const existingUser = await withRetry(() => prisma.user.findUnique({
      where: { phone }
    }));

    res.json({
      success: true,
      message: 'OTP sent successfully',
      isNewUser: !existingUser,
      expiresIn: OTP_EXPIRY_MINUTES * 60, // in seconds
      // Show OTP in response for testing (remove when SMS is integrated)
      devOtp: otp
    });

  } catch (error) {
    console.error('Error sending OTP:', error.message);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
};

/**
 * Verify OTP and login/signup user
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp, name, shopName } = req.body;

    // Validate inputs
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone number and OTP are required' });
    }

    // Find the OTP record
    const otpRecord = await withRetry(() => prisma.otp.findFirst({
      where: {
        phone,
        verified: false
      },
      orderBy: {
        createdAt: 'desc'
      }
    }));

    if (!otpRecord) {
      return res.status(400).json({ error: 'OTP not found. Please request a new OTP.' });
    }

    // Check if OTP has expired
    if (new Date() > otpRecord.expiresAt) {
      await withRetry(() => prisma.otp.delete({ where: { id: otpRecord.id } }));
      return res.status(400).json({ error: 'OTP has expired. Please request a new OTP.' });
    }

    // Check attempts
    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      await withRetry(() => prisma.otp.delete({ where: { id: otpRecord.id } }));
      return res.status(400).json({ error: 'Too many failed attempts. Please request a new OTP.' });
    }

    // Verify OTP
    if (otpRecord.otp !== otp) {
      // Increment attempts
      await withRetry(() => prisma.otp.update({
        where: { id: otpRecord.id },
        data: { attempts: otpRecord.attempts + 1 }
      }));
      
      const remainingAttempts = MAX_OTP_ATTEMPTS - otpRecord.attempts - 1;
      return res.status(400).json({ 
        error: `Invalid OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.` 
      });
    }

    // OTP is valid - mark as verified
    await withRetry(() => prisma.otp.update({
      where: { id: otpRecord.id },
      data: { verified: true }
    }));

    // Check if user exists or create new user
    let user = await withRetry(() => prisma.user.findUnique({
      where: { phone }
    }));

    const isNewUser = !user;

    if (!user) {
      // Create new user
      user = await withRetry(() => prisma.user.create({
        data: {
          phone,
          name: name || null,
          shopName: shopName || null
        }
      }));
    } else if (name && !user.name) {
      // Update name and shopName if provided and user doesn't have one
      user = await withRetry(() => prisma.user.update({
        where: { id: user.id },
        data: { 
          name,
          ...(shopName && !user.shopName ? { shopName } : {})
        }
      }));
    } else if (shopName && !user.shopName) {
      // Update shopName if provided and user doesn't have one
      user = await withRetry(() => prisma.user.update({
        where: { id: user.id },
        data: { shopName }
      }));
    }

    // Clean up used OTP
    await withRetry(() => prisma.otp.delete({ where: { id: otpRecord.id } }));

    res.json({
      success: true,
      message: isNewUser ? 'Account created successfully!' : 'Login successful!',
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        shopName: user.shopName,
        email: user.email,
        createdAt: user.createdAt
      },
      isNewUser
    });

  } catch (error) {
    console.error('Error verifying OTP:', error.message);
    res.status(500).json({ error: 'Failed to verify OTP. Please try again.' });
  }
};

/**
 * Resend OTP
 */
exports.resendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Check rate limiting - don't allow too frequent resends
    const recentOtp = await withRetry(() => prisma.otp.findFirst({
      where: {
        phone,
        createdAt: {
          gte: new Date(Date.now() - 30 * 1000) // 30 seconds
        }
      }
    }));

    if (recentOtp) {
      return res.status(429).json({ 
        error: 'Please wait before requesting a new OTP.',
        retryAfter: 30
      });
    }

    // Use sendOtp logic
    return exports.sendOtp(req, res);

  } catch (error) {
    console.error('Error resending OTP:', error.message);
    res.status(500).json({ error: 'Failed to resend OTP. Please try again.' });
  }
};

/**
 * Update user profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email } = req.body;

    const user = await withRetry(() => prisma.user.findUnique({
      where: { id: userId }
    }));

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email is already used by another user
    if (email && email !== user.email) {
      const existingEmail = await withRetry(() => prisma.user.findUnique({
        where: { email }
      }));
      if (existingEmail) {
        return res.status(400).json({ error: 'Email is already in use' });
      }
    }

    const { shopName: newShopName } = req.body;

    const updatedUser = await withRetry(() => prisma.user.update({
      where: { id: userId },
      data: {
        name: name !== undefined ? name : user.name,
        email: email !== undefined ? email : user.email,
        shopName: newShopName !== undefined ? newShopName : user.shopName
      }
    }));

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        phone: updatedUser.phone,
        name: updatedUser.name,
        shopName: updatedUser.shopName,
        email: updatedUser.email,
        createdAt: updatedUser.createdAt
      }
    });

  } catch (error) {
    console.error('Error updating profile:', error.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

/**
 * Get user profile
 */
exports.getProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await withRetry(() => prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: { bills: true }
        }
      }
    }));

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        shopName: user.shopName,
        email: user.email,
        createdAt: user.createdAt,
        billCount: user._count.bills
      }
    });

  } catch (error) {
    console.error('Error fetching profile:', error.message);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};
