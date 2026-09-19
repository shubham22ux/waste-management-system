import { RekognitionClient, DetectLabelsCommand } from '@aws-sdk/client-rekognition';

const AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const ENABLE_REKOGNITION = process.env.AWS_ENABLE_REKOGNITION === 'true';

let rekognitionClient = null;

export function isRekognitionConfigured() {
  return Boolean(
    ENABLE_REKOGNITION &&
    ((AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) || process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || process.env.AWS_EXECUTION_ENV)
  );
}

function getRekognitionClient() {
  if (!rekognitionClient && isRekognitionConfigured()) {
    const config = { region: AWS_REGION };
    if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
      };
    }
    rekognitionClient = new RekognitionClient(config);
  }
  return rekognitionClient;
}

const WASTE_KEYWORDS = [
  'trash',
  'garbage',
  'waste',
  'rubbish',
  'litter',
  'dumpster',
  'bin',
  'waste container',
  'plastic',
  'debris',
  'scrap',
  'landfill'
];

/**
 * Analyzes an image buffer using Amazon Rekognition to detect waste/overflow labels.
 * @param {Buffer} imageBytes
 * @returns {Promise<{ isWasteDetected: boolean, confidence: number, labels: Array<{ name: string, confidence: number }>, skipped: boolean }>}
 */
export async function detectWasteLabels(imageBytes) {
  if (!isRekognitionConfigured()) {
    return {
      isWasteDetected: true,
      confidence: 100,
      labels: [],
      skipped: true,
      reason: 'Amazon Rekognition not configured or disabled'
    };
  }

  try {
    const client = getRekognitionClient();
    const command = new DetectLabelsCommand({
      Image: {
        Bytes: imageBytes
      },
      MaxLabels: 15,
      MinConfidence: 60
    });

    const response = await client.send(command);
    const labels = (response.Labels || []).map(l => ({
      name: l.Name,
      confidence: Math.round(l.Confidence || 0)
    }));

    const matchedLabels = labels.filter(l =>
      WASTE_KEYWORDS.some(kw => l.name.toLowerCase().includes(kw))
    );

    const isWasteDetected = matchedLabels.length > 0;
    const topConfidence = matchedLabels.length > 0 ? matchedLabels[0].confidence : 0;

    console.log(`[AWS Rekognition] Image analyzed. Waste detected: ${isWasteDetected} (${topConfidence}%)`);

    return {
      isWasteDetected,
      confidence: topConfidence,
      labels,
      matchedLabels,
      skipped: false
    };
  } catch (err) {
    console.warn('[AWS Rekognition Warning] Rekognition analysis failed, passing through:', err.message);
    return {
      isWasteDetected: true,
      confidence: 0,
      labels: [],
      skipped: true,
      error: err.message
    };
  }
}
