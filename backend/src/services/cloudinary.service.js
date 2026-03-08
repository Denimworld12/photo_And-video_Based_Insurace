const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');

/**
 * Upload a local file to Cloudinary and return the secure URL + public_id.
 */
const uploadClaimImage = async (localFilePath, claimDocumentId, stepId) => {
  const result = await uploadToCloudinary(localFilePath, {
    folder: `pbi-agriinsure/claims/${claimDocumentId}`,
    public_id: stepId,
    transformation: [
      { width: 1920, height: 1080, crop: 'limit' },
      { quality: 'auto:good' },
      { fetch_format: 'auto' },
    ],
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
  };
};

/**
 * Delete all images from a claim folder.
 */
const deleteClaimImages = async (publicIds = []) => {
  const promises = publicIds.map((id) => deleteFromCloudinary(id));
  return Promise.allSettled(promises);
};

module.exports = { uploadClaimImage, deleteClaimImages };
