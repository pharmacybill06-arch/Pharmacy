const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ledger payment attachments: UPI screenshots, photographed receipts/cheques/credit notes
const uploadsDir = path.join(__dirname, '../../uploads/payments');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const userId = req.params.userId || 'anonymous';
    const timestamp = Date.now();
    cb(null, `${timestamp}-${userId}-${file.originalname}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB — client compresses before upload
    files: 1,
  },
});

module.exports = upload;
