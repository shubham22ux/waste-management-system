import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../../uploads');

// Ensure local uploads directory exists for fallback
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Environment settings
const AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET;
const AWS_CLOUDFRONT_DOMAIN = process.env.AWS_CLOUDFRONT_DOMAIN;
const AWS_S3_ENDPOINT = process.env.AWS_S3_ENDPOINT; // Optional for LocalStack / MinIO

let s3Client = null;

export function isS3Configured() {
  return Boolean(
    AWS_S3_BUCKET &&
    ((AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) || process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || process.env.AWS_EXECUTION_ENV)
  );
}

function getS3Client() {
  if (!s3Client && isS3Configured()) {
    const config = {
      region: AWS_REGION
    };

    if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
      };
    }

    if (AWS_S3_ENDPOINT) {
      config.endpoint = AWS_S3_ENDPOINT;
      config.forcePathStyle = true;
    }

    s3Client = new S3Client(config);
  }
  return s3Client;
}

/**
 * Uploads a file to Amazon S3 or falls back to local disk storage
 * @param {Object} params
 * @param {Buffer} params.buffer - File buffer
 * @param {string} params.originalname - Original file name
 * @param {string} params.mimetype - MIME type (e.g. image/jpeg)
 * @param {string} [params.folder='complaints'] - Target S3 prefix/subfolder
 * @returns {Promise<{ url: string, key: string, provider: 's3'|'local' }>}
 */
export async function uploadFile({ buffer, originalname, mimetype, folder = 'complaints' }) {
  const ext = path.extname(originalname) || '.jpg';
  const uniqueName = `${folder}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

  // AWS S3 Upload Path
  if (isS3Configured()) {
    try {
      const client = getS3Client();
      const s3Key = `${folder}/${uniqueName}`;

      const command = new PutObjectCommand({
        Bucket: AWS_S3_BUCKET,
        Key: s3Key,
        Body: buffer,
        ContentType: mimetype || 'image/jpeg'
      });

      await client.send(command);

      let publicUrl;
      if (AWS_CLOUDFRONT_DOMAIN) {
        const domain = AWS_CLOUDFRONT_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '');
        publicUrl = `https://${domain}/${s3Key}`;
      } else if (AWS_S3_ENDPOINT) {
        publicUrl = `${AWS_S3_ENDPOINT}/${AWS_S3_BUCKET}/${s3Key}`;
      } else {
        publicUrl = `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
      }

      console.log(`[Storage] Uploaded to S3 successfully: ${publicUrl}`);
      return {
        url: publicUrl,
        key: s3Key,
        provider: 's3',
        bucket: AWS_S3_BUCKET
      };
    } catch (err) {
      console.error('[Storage Error] S3 upload failed, attempting local fallback:', err.message);
    }
  }

  // Local Disk Storage Fallback
  const localFilePath = path.join(uploadsDir, uniqueName);
  await fs.promises.writeFile(localFilePath, buffer);
  const localUrl = `/uploads/${uniqueName}`;

  console.log(`[Storage] Saved locally: ${localUrl}`);
  return {
    url: localUrl,
    key: uniqueName,
    provider: 'local'
  };
}

/**
 * Deletes a file from Amazon S3 or local disk storage
 * @param {string} fileUrlOrKey - S3 Key, public URL, or local /uploads/ filename
 */
export async function deleteFile(fileUrlOrKey) {
  if (!fileUrlOrKey) return;

  if (isS3Configured() && (fileUrlOrKey.includes('amazonaws.com') || fileUrlOrKey.startsWith('complaints/'))) {
    try {
      const client = getS3Client();
      let s3Key = fileUrlOrKey;

      if (fileUrlOrKey.includes('.amazonaws.com/')) {
        s3Key = fileUrlOrKey.split('.amazonaws.com/')[1];
      } else if (AWS_CLOUDFRONT_DOMAIN && fileUrlOrKey.includes(AWS_CLOUDFRONT_DOMAIN)) {
        s3Key = fileUrlOrKey.split(`${AWS_CLOUDFRONT_DOMAIN}/`)[1];
      }

      await client.send(new DeleteObjectCommand({
        Bucket: AWS_S3_BUCKET,
        Key: s3Key
      }));
      console.log(`[Storage] Deleted from S3: ${s3Key}`);
      return;
    } catch (err) {
      console.error('[Storage Error] S3 delete error:', err.message);
    }
  }

  // Local deletion
  try {
    const filename = path.basename(fileUrlOrKey);
    const localPath = path.join(uploadsDir, filename);
    if (fs.existsSync(localPath)) {
      await fs.promises.unlink(localPath);
      console.log(`[Storage] Deleted local file: ${localPath}`);
    }
  } catch (err) {
    console.error('[Storage Error] Local delete error:', err.message);
  }
}
