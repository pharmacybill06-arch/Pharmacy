const express = require('express');
const router = express.Router();
const expiryController = require('../controllers/expiryController');

// Get items inside the action window
router.get('/user/:userId/window', expiryController.getExpiryWindow);

// Apply an action to a batch (update qty, sold, returned, writeoff)
router.patch('/items/:itemId/action', expiryController.applyExpiryAction);

// Archived items
router.get('/user/:userId/archive', expiryController.getArchive);

module.exports = router;
