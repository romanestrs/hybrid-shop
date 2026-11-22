// Local file-system storage only (no S3 / Cloudinary / CDN)
const multer = require('multer');
const path = require('path');
const fs = require('fs');

function uploader(folder) {
  const dir = path.join(__dirname, '..', '..', 'uploads', folder);
  fs.mkdirSync(dir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (req, file, cb) =>
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) =>
      /^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype) ? cb(null, true) : cb(new Error('Only image files are allowed')),
  });
}
module.exports = { productUpload: uploader('products'), avatarUpload: uploader('avatars') };
