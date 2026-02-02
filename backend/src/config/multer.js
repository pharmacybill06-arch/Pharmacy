const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/bills');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Create unique filename: timestamp-userid-originalname
    const userId = req.userId || 'anonymous';
    const timestamp = Date.now();
    const originalName = file.originalname;
    cb(null, `${timestamp}-${userId}-${originalName}`);
  }
});

// File filter for image uploads only (for bill images)
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, WebP, and PDF files are allowed'), false);
  }
};

// Multer configuration
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
    files: 1 // Only single file per upload for now
  }
});

module.exports = upload;
