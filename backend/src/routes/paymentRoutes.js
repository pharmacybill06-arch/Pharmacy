const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Get all payments for a user
router.get('/user/:userId', paymentController.getPayments);

// Get payment stats for a user
router.get('/user/:userId/stats', paymentController.getPaymentStats);

// Create new payment (from shared UPI receipt)
router.post('/user/:userId', paymentController.createPayment);

// Auto-match distributor from payee name
router.post('/user/:userId/match-distributor', paymentController.matchDistributor);

// Get payments for a specific distributor
router.get('/distributor/:distributorId', paymentController.getDistributorPayments);

// Get single payment by ID
router.get('/:paymentId', paymentController.getPaymentById);

// Update payment (link distributor, add notes)
router.put('/:paymentId', paymentController.updatePayment);

// Delete payment
router.delete('/:paymentId', paymentController.deletePayment);

module.exports = router;
