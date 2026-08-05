const express = require('express');
const cors = require('cors');
const path = require('path');

// Initialize Express app
const app = express();

// Middleware: Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Middleware: CORS
app.use(cors());

// Middleware: Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend is running', timestamp: new Date() });
});

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/bills', require('./routes/billRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/invoices', require('./routes/invoiceRoutes'));
app.use('/api/distributors', require('./routes/distributorRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/ledger', require('./routes/ledgerRoutes'));
app.use('/api/gstin', require('./routes/gstinRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/email-bills', require('./routes/emailBillRoutes'));
app.use('/api/expiry', require('./routes/expiryRoutes'));
app.use('/api/patients', require('./routes/patientRoutes'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  
  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File size too large' });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Too many files' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected file upload' });
  }
  
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app;
