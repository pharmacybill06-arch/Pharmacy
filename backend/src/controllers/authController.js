const prisma = require('../models/prisma');

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

    // Delete any existing OTPs for this phone
    await prisma.otp.deleteMany({
      where: { phone }
    });

    // Store OTP in database
    await prisma.otp.create({
      data: {
        phone,
        otp,
        expiresAt
      }
    });

    // In production, send OTP via SMS gateway here
    // For development, we'll log it and return success
    console.log(`[OTP] Phone: ${phone}, OTP: ${otp} (expires in ${OTP_EXPIRY_MINUTES} minutes)`);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { phone }
    });

    res.json({
      success: true,
      message: 'OTP sent successfully',
      isNewUser: !existingUser,
      expiresIn: OTP_EXPIRY_MINUTES * 60, // in seconds
      // Remove this in production - only for development testing
      ...(process.env.NODE_ENV !== 'production' && { devOtp: otp })
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
    const { phone, otp, name } = req.body;

    // Validate inputs
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone number and OTP are required' });
    }

    // Find the OTP record
    const otpRecord = await prisma.otp.findFirst({
      where: {
        phone,
        verified: false
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!otpRecord) {
      return res.status(400).json({ error: 'OTP not found. Please request a new OTP.' });
    }

    // Check if OTP has expired
    if (new Date() > otpRecord.expiresAt) {
      await prisma.otp.delete({ where: { id: otpRecord.id } });
      return res.status(400).json({ error: 'OTP has expired. Please request a new OTP.' });
    }

    // Check attempts
    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      await prisma.otp.delete({ where: { id: otpRecord.id } });
      return res.status(400).json({ error: 'Too many failed attempts. Please request a new OTP.' });
    }

    // Verify OTP
    if (otpRecord.otp !== otp) {
      // Increment attempts
      await prisma.otp.update({
        where: { id: otpRecord.id },
        data: { attempts: otpRecord.attempts + 1 }
      });
      
      const remainingAttempts = MAX_OTP_ATTEMPTS - otpRecord.attempts - 1;
      return res.status(400).json({ 
        error: `Invalid OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.` 
      });
    }

    // OTP is valid - mark as verified
    await prisma.otp.update({
      where: { id: otpRecord.id },
      data: { verified: true }
    });

    // Check if user exists or create new user
    let user = await prisma.user.findUnique({
      where: { phone }
    });

    const isNewUser = !user;

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          phone,
          name: name || null
        }
      });
    } else if (name && !user.name) {
      // Update name if provided and user doesn't have one
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name }
      });
    }

    // Clean up used OTP
    await prisma.otp.delete({ where: { id: otpRecord.id } });

    res.json({
      success: true,
      message: isNewUser ? 'Account created successfully!' : 'Login successful!',
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
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
    const recentOtp = await prisma.otp.findFirst({
      where: {
        phone,
        createdAt: {
          gte: new Date(Date.now() - 30 * 1000) // 30 seconds
        }
      }
    });

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

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email is already used by another user
    if (email && email !== user.email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email }
      });
      if (existingEmail) {
        return res.status(400).json({ error: 'Email is already in use' });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name !== undefined ? name : user.name,
        email: email !== undefined ? email : user.email
      }
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        phone: updatedUser.phone,
        name: updatedUser.name,
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

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: { bills: true }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
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
