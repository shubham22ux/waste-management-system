import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isS3Configured, uploadFile, deleteFile } from '../src/services/storageService.js';
import { isRekognitionConfigured, detectWasteLabels } from '../src/services/rekognitionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('AWS Cloud Services & Storage Engine Tests', () => {

  it('should detect whether S3 credentials are configured without throwing', () => {
    const configured = isS3Configured();
    assert.strictEqual(typeof configured, 'boolean');
  });

  it('should detect whether Rekognition is configured without throwing', () => {
    const configured = isRekognitionConfigured();
    assert.strictEqual(typeof configured, 'boolean');
  });

  it('should gracefully fallback to local disk storage when S3 is not active', async () => {
    const sampleBuffer = Buffer.from('fake image content for testing');
    const result = await uploadFile({
      buffer: sampleBuffer,
      originalname: 'test-waste.jpg',
      mimetype: 'image/jpeg',
      folder: 'complaints'
    });

    assert.ok(result);
    assert.ok(result.url);
    assert.strictEqual(typeof result.url, 'string');
    assert.ok(result.provider === 'local' || result.provider === 's3');

    // If local, check file on disk and clean up
    if (result.provider === 'local') {
      const filename = path.basename(result.url);
      const filePath = path.join(__dirname, '../uploads', filename);
      assert.ok(fs.existsSync(filePath), 'Uploaded file should exist on disk');

      // Test deleteFile
      await deleteFile(result.url);
      assert.ok(!fs.existsSync(filePath), 'File should be removed after deletion');
    }
  });

  it('should pass-through image analysis when Rekognition is inactive', async () => {
    const sampleBuffer = Buffer.from('fake image bytes');
    const result = await detectWasteLabels(sampleBuffer);

    assert.ok(result);
    assert.strictEqual(typeof result.isWasteDetected, 'boolean');
    assert.strictEqual(result.skipped, true);
  });
});
