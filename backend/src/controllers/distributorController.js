const distributorService = require('../services/distributorService');

/**
 * Distributor Controller
 * Handles HTTP requests for distributor management
 */

// Get all distributors for a user
exports.getDistributors = async (req, res) => {
  try {
    const { userId } = req.params;
    const { search, includeInactive, sortBy, sortOrder } = req.query;

    const distributors = await distributorService.getDistributors(userId, {
      search,
      includeInactive: includeInactive === 'true',
      sortBy,
      sortOrder
    });

    res.json({
      message: 'Distributors fetched successfully',
      total: distributors.length,
      distributors
    });
  } catch (error) {
    console.error('Error fetching distributors:', error.message);
    res.status(500).json({ error: 'Failed to fetch distributors' });
  }
};

// Get single distributor by ID
exports.getDistributorById = async (req, res) => {
  try {
    const { distributorId } = req.params;

    const distributor = await distributorService.getDistributorById(distributorId);

    if (!distributor) {
      return res.status(404).json({ error: 'Distributor not found' });
    }

    res.json({
      message: 'Distributor fetched successfully',
      distributor
    });
  } catch (error) {
    console.error('Error fetching distributor:', error.message);
    res.status(500).json({ error: 'Failed to fetch distributor' });
  }
};

// Get bills for a distributor
exports.getDistributorBills = async (req, res) => {
  try {
    const { distributorId } = req.params;
    const { page, limit } = req.query;

    const result = await distributorService.getDistributorBills(distributorId, {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20
    });

    res.json({
      message: 'Distributor bills fetched successfully',
      ...result
    });
  } catch (error) {
    console.error('Error fetching distributor bills:', error.message);
    res.status(500).json({ error: 'Failed to fetch distributor bills' });
  }
};

// Create new distributor
exports.createDistributor = async (req, res) => {
  try {
    const { userId } = req.params;
    const distributorData = req.body;

    const distributor = await distributorService.createDistributor(userId, distributorData);

    res.status(201).json({
      message: 'Distributor created successfully',
      distributor
    });
  } catch (error) {
    console.error('Error creating distributor:', error.message);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to create distributor' });
  }
};

// Update distributor
exports.updateDistributor = async (req, res) => {
  try {
    const { distributorId } = req.params;
    const updateData = req.body;

    const distributor = await distributorService.updateDistributor(distributorId, updateData);

    res.json({
      message: 'Distributor updated successfully',
      distributor
    });
  } catch (error) {
    console.error('Error updating distributor:', error.message);
    res.status(500).json({ error: 'Failed to update distributor' });
  }
};

// Delete distributor (soft delete)
exports.deleteDistributor = async (req, res) => {
  try {
    const { distributorId } = req.params;

    await distributorService.deleteDistributor(distributorId);

    res.json({
      message: 'Distributor deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting distributor:', error.message);
    res.status(500).json({ error: 'Failed to delete distributor' });
  }
};

// Migrate existing pharmacyName to distributors (one-time)
exports.migratePharmacyNames = async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await distributorService.migratePharmacyNames(userId);

    res.json({
      message: 'Migration completed successfully',
      ...result
    });
  } catch (error) {
    console.error('Error during migration:', error.message);
    res.status(500).json({ error: 'Migration failed' });
  }
};

// Search distributors (for autocomplete)
exports.searchDistributors = async (req, res) => {
  try {
    const { userId } = req.params;
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json({ distributors: [] });
    }

    const distributors = await distributorService.getDistributors(userId, {
      search: q,
      sortBy: 'name'
    });

    res.json({
      distributors: distributors.slice(0, 10) // Limit to 10 for autocomplete
    });
  } catch (error) {
    console.error('Error searching distributors:', error.message);
    res.status(500).json({ error: 'Failed to search distributors' });
  }
};
