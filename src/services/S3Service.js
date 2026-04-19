const AWS = require('aws-sdk');
const path = require('path');
const crypto = require('crypto');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const uploadFile = async (file) => {
  const folder = process.env.AWS_S3_FOLDER || 'uploads';
  const fileName = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
  const key = `${folder}/${fileName}`;

  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  await s3.upload(params).promise();
  
  let cfDomain = process.env.CLOUDFRONT_DOMAIN;
  if (cfDomain) {
    if (!cfDomain.startsWith('http')) cfDomain = `https://${cfDomain}`;
    // Vì bạn đã set Origin Path là /ott-chat/attachments nên link CloudFront chỉ cần file name
    return `${cfDomain.replace(/\/$/, '')}/${fileName}`;
  }
  
  return `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${key}`;
};

const getPresignedUrl = async (fileName, fileType) => {
  const extension = path.extname(fileName);
  const folder = process.env.AWS_S3_FOLDER || 'uploads';
  const fileNameUuid = `${crypto.randomUUID()}${extension}`;
  const key = `${folder}/${fileNameUuid}`;

  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    Expires: 300, // 5 minutes
    ContentType: fileType,
  };

  const uploadUrl = await s3.getSignedUrlPromise('putObject', params);
  
  let cfDomain = process.env.CLOUDFRONT_DOMAIN;
  let finalUrl;
  
  if (cfDomain) {
    if (!cfDomain.startsWith('http')) cfDomain = `https://${cfDomain}`;
    // Rút gọn URL cho CloudFront (bỏ folder vì đã có trong Origin Path)
    finalUrl = `${cfDomain.replace(/\/$/, '')}/${fileNameUuid}`;
  } else {
    finalUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${key}`;
  }

  return { uploadUrl, finalUrl };
};

module.exports = { uploadFile, getPresignedUrl };
