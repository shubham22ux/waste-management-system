#!/bin/bash
# ==============================================================================
# SmartWaste - AWS S3 & Cloud Resources Quick Provisioner (Bash)
# Usage: bash aws/setup-aws-resources.sh [region] [project_name]
# ==============================================================================

set -e

REGION="${1:-us-east-1}"
PROJECT_NAME="${2:-smartwaste}"

echo "========================================================"
echo " 🌿 SmartWaste AWS Cloud Resource Provisioner"
echo "========================================================"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "✖ AWS CLI is not installed. Please install it first."
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "✔ Authenticated with AWS Account: $ACCOUNT_ID"

RANDOM_SUFFIX=$((1000 + RANDOM % 9000))
MEDIA_BUCKET="${PROJECT_NAME}-media-${ACCOUNT_ID}-${RANDOM_SUFFIX}"
FRONTEND_BUCKET="${PROJECT_NAME}-web-${ACCOUNT_ID}-${RANDOM_SUFFIX}"

echo ""
echo "1. Creating S3 Media Bucket: $MEDIA_BUCKET..."
if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$MEDIA_BUCKET" --region "$REGION"
else
    aws s3api create-bucket --bucket "$MEDIA_BUCKET" --region "$REGION" --create-bucket-configuration LocationConstraint="$REGION"
fi

echo "Configuring Public Access..."
aws s3api put-public-access-block --bucket "$MEDIA_BUCKET" --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

echo "Setting CORS Policy..."
aws s3api put-bucket-cors --bucket "$MEDIA_BUCKET" --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
      "AllowedOrigins": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}'

echo "Setting Public-Read Policy..."
aws s3api put-bucket-policy --bucket "$MEDIA_BUCKET" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {
      \"Sid\": \"PublicReadGetObject\",
      \"Effect\": \"Allow\",
      \"Principal\": \"*\",
      \"Action\": \"s3:GetObject\",
      \"Resource\": \"arn:aws:s3:::${MEDIA_BUCKET}/*\"
    }
  ]
}"

echo ""
echo "2. Creating Frontend Static Website Bucket: $FRONTEND_BUCKET..."
if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$FRONTEND_BUCKET" --region "$REGION"
else
    aws s3api create-bucket --bucket "$FRONTEND_BUCKET" --region "$REGION" --create-bucket-configuration LocationConstraint="$REGION"
fi

aws s3 website "s3://${FRONTEND_BUCKET}" --index-document index.html --error-document index.html

echo ""
echo "========================================================"
echo " ✔ AWS S3 Buckets Configured!"
echo "========================================================"
echo "Update your server/.env with:"
echo "AWS_REGION=$REGION"
echo "AWS_S3_BUCKET=$MEDIA_BUCKET"
echo ""
echo "Deploy Frontend via:"
echo "  npm run build --prefix client"
echo "  aws s3 sync client/dist s3://$FRONTEND_BUCKET"
echo "========================================================"
