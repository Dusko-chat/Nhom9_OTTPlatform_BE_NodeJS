const AWS = require('aws-sdk');
const path = require('path');
const crypto = require('crypto');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const uploadFile = async (file) => {
  const fileName = `${process.env.AWS_S3_FOLDER || 'uploads'}/${crypto.randomUUID()}${path.extname(file.originalname)}`;

  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  const { Location } = await s3.upload(params).promise();
  return Location;
};

const getPresignedUrl = async (fileName, fileType) => {
  const extension = path.extname(fileName);
  const key = `${process.env.AWS_S3_FOLDER || 'uploads'}/${crypto.randomUUID()}${extension}`;

  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    Expires: 300, // 5 minutes
    ContentType: fileType,
  };

  const uploadUrl = await s3.getSignedUrlPromise('putObject', params);
  
  // Return both the upload URL and the final public URL
  // Standard S3 URL format
  const finalUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${key}`;

  return { uploadUrl, finalUrl };
};

module.exports = { uploadFile, getPresignedUrl };
