const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a file buffer/path to Cloudinary.
 * @param {string} filePath  – local path or base64 data URI
 * @param {object} options   – folder, public_id, transformation overrides
 * @returns {Promise<object>} Cloudinary upload result
 */
const uploadToCloudinary = async (filePath, options = {}) => {
  const defaults = {
    folder: 'pbi-agriinsure/claims',
    resource_type: 'auto',
    quality: 'auto:good',
    fetch_format: 'auto',
  };

  return cloudinary.uploader.upload(filePath, { ...defaults, ...options });
};

/**
 * Delete an asset from Cloudinary by public_id.
 */
const deleteFromCloudinary = async (publicId) => {
  return cloudinary.uploader.destroy(publicId);
};

module.exports = { cloudinary, uploadToCloudinary, deleteFromCloudinary };
