const express = require('express');
const router = express.Router();
const distributorController = require('../controllers/distributorController');

// Get all distributors for a user
router.get('/user/:userId', distributorController.getDistributors);

// Search distributors (for autocomplete)
router.get('/user/:userId/search', distributorController.searchDistributors);

// Migrate existing pharmacyName to distributors
router.post('/user/:userId/migrate', distributorController.migratePharmacyNames);

// Create new distributor
router.post('/user/:userId', distributorController.createDistributor);

// Get single distributor by ID
router.get('/:distributorId', distributorController.getDistributorById);

// Get bills for a distributor
router.get('/:distributorId/bills', distributorController.getDistributorBills);

// Update distributor
router.put('/:distributorId', distributorController.updateDistributor);

// Delete distributor (soft delete)
router.delete('/:distributorId', distributorController.deleteDistributor);

module.exports = router;
