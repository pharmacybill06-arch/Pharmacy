const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Create a new user
router.post('/', userController.createUser);

// Get all users
router.get('/', userController.getAllUsers);

// Get user by ID
router.get('/:userId', userController.getUserById);

// Update user
router.put('/:userId', userController.updateUser);

// Save this device's Expo push token
router.put('/:userId/push-token', userController.savePushToken);

// Delete user
router.delete('/:userId', userController.deleteUser);

module.exports = router;
