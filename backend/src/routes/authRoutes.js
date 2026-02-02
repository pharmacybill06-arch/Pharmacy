const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Send OTP to phone number
router.post('/send-otp', authController.sendOtp);

// Verify OTP and login/signup
router.post('/verify-otp', authController.verifyOtp);

// Resend OTP
router.post('/resend-otp', authController.resendOtp);

// Get user profile
router.get('/profile/:userId', authController.getProfile);

// Update user profile
router.put('/profile/:userId', authController.updateProfile);

module.exports = router;
