const multer = require('multer');

// UPI screenshot scanning: the image is only read, never kept. Memory storage hands the
// bytes to the AI reader and they are dropped with the request — nothing touches disk.
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

module.exports = upload;
