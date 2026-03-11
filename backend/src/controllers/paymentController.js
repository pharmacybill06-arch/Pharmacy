const paymentService = require('../services/paymentService');

/**
 * Payment Controller
 * Handles HTTP requests for UPI payment tracking
 */

// Create a new payment from shared UPI receipt
exports.createPayment = async (req, res) => {
  try {
    const { userId } = req.params;
    const paymentData = req.body;

    const payment = await paymentService.createPayment(userId, paymentData);

    res.status(201).json({
      message: 'Payment recorded successfully',
      payment,
    });
  } catch (error) {
    console.error('Error creating payment:', error.message);

    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    if (error.message.includes('required') || error.message.includes('not found')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to record payment' });
  }
};

// Get all payments for a user
exports.getPayments = async (req, res) => {
  try {
    const { userId } = req.params;
    const { distributorId, paymentApp, paymentStatus, startDate, endDate, sortBy, sortOrder, page, limit } = req.query;

    const result = await paymentService.getPayments(userId, {
      distributorId,
      paymentApp,
      paymentStatus,
      startDate,
      endDate,
      sortBy,
      sortOrder,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });

    res.json({
      message: 'Payments fetched successfully',
      ...result,
    });
  } catch (error) {
    console.error('Error fetching payments:', error.message);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
};

// Get a single payment by ID
exports.getPaymentById = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await paymentService.getPaymentById(paymentId);

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({
      message: 'Payment fetched successfully',
      payment,
    });
  } catch (error) {
    console.error('Error fetching payment:', error.message);
    res.status(500).json({ error: 'Failed to fetch payment' });
  }
};

// Get payments for a specific distributor
exports.getDistributorPayments = async (req, res) => {
  try {
    const { distributorId } = req.params;
    const { page, limit } = req.query;

    const result = await paymentService.getDistributorPayments(distributorId, {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });

    res.json({
      message: 'Distributor payments fetched successfully',
      ...result,
    });
  } catch (error) {
    console.error('Error fetching distributor payments:', error.message);
    res.status(500).json({ error: 'Failed to fetch distributor payments' });
  }
};

// Get payment stats for a user
exports.getPaymentStats = async (req, res) => {
  try {
    const { userId } = req.params;

    const stats = await paymentService.getPaymentStats(userId);

    res.json({
      message: 'Payment stats fetched successfully',
      stats,
    });
  } catch (error) {
    console.error('Error fetching payment stats:', error.message);
    res.status(500).json({ error: 'Failed to fetch payment stats' });
  }
};

// Update a payment (e.g., link distributor, add notes)
exports.updatePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const updateData = req.body;

    const payment = await paymentService.updatePayment(paymentId, updateData);

    res.json({
      message: 'Payment updated successfully',
      payment,
    });
  } catch (error) {
    console.error('Error updating payment:', error.message);
    res.status(500).json({ error: 'Failed to update payment' });
  }
};

// Delete a payment
exports.deletePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    await paymentService.deletePayment(paymentId);

    res.json({
      message: 'Payment deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting payment:', error.message);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
};

// Try to auto-match distributor from payee name
exports.matchDistributor = async (req, res) => {
  try {
    const { userId } = req.params;
    const { payeeName } = req.body;

    if (!payeeName) {
      return res.status(400).json({ error: 'Payee name is required' });
    }

    const distributor = await paymentService.matchDistributor(userId, payeeName);

    res.json({
      message: distributor ? 'Distributor matched' : 'No match found',
      matched: !!distributor,
      distributor,
    });
  } catch (error) {
    console.error('Error matching distributor:', error.message);
    res.status(500).json({ error: 'Failed to match distributor' });
  }
};
