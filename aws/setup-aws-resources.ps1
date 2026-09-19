# ==============================================================================
# SmartWaste - AWS S3 & Cloud Resources Quick Provisioner (PowerShell)
# Run this script using: powershell -ExecutionPolicy Bypass -File .\aws\setup-aws-resources.ps1
# ==============================================================================

param (
    [string]$Region = "us-east-1",
    [string]$ProjectName = "smartwaste"
)

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " 🌿 SmartWaste AWS Cloud Resource Provisioner" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Check AWS CLI
try {
    $callerIdentity = aws sts get-caller-identity | ConvertFrom-Json
    Write-Host "✔ AWS CLI authenticated as: $($callerIdentity.Arn)" -ForegroundColor Green
    $accountId = $callerIdentity.Account
} catch {
    Write-Host "✖ AWS CLI is not configured or not installed." -ForegroundColor Red
    Write-Host "Please run 'aws configure' with your AWS credentials first." -ForegroundColor Yellow
    exit 1
}

$randomSuffix = Get-Random -Minimum 1000 -Maximum 9999
$mediaBucketName = "$ProjectName-media-$accountId-$randomSuffix"
$frontendBucketName = "$ProjectName-web-$accountId-$randomSuffix"

Write-Host "`n1. Creating S3 Media Bucket for Grievance Photos: $mediaBucketName..." -ForegroundColor Cyan
if ($Region -eq "us-east-1") {
    aws s3api create-bucket --bucket $mediaBucketName --region $Region
} else {
    aws s3api create-bucket --bucket $mediaBucketName --region $Region --create-bucket-configuration LocationConstraint=$Region
}

# Disable Block Public Access for public photo reading
Write-Host "Configuring Public Access for Media Bucket..." -ForegroundColor Cyan
aws s3api put-public-access-block --bucket $mediaBucketName --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# Set S3 CORS
Write-Host "Setting CORS Policy on Media Bucket..." -ForegroundColor Cyan
$corsJson = @"
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
      "AllowedOrigins": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
"@
$corsFile = [System.IO.Path]::GetTempFileName()
Set-Content -Path $corsFile -Value $corsJson
aws s3api put-bucket-cors --bucket $mediaBucketName --cors-configuration file://$corsFile
Remove-Item $corsFile

# Set Bucket Policy for Public Read
Write-Host "Applying Public-Read Bucket Policy..." -ForegroundColor Cyan
$policyJson = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$mediaBucketName/*"
    }
  ]
}
"@
$policyFile = [System.IO.Path]::GetTempFileName()
Set-Content -Path $policyFile -Value $policyJson
aws s3api put-bucket-policy --bucket $mediaBucketName --policy file://$policyFile
Remove-Item $policyFile

Write-Host "`n2. Creating S3 Frontend Hosting Bucket: $frontendBucketName..." -ForegroundColor Cyan
if ($Region -eq "us-east-1") {
    aws s3api create-bucket --bucket $frontendBucketName --region $Region
} else {
    aws s3api create-bucket --bucket $frontendBucketName --region $Region --create-bucket-configuration LocationConstraint=$Region
}

aws s3 website "s3://$frontendBucketName" --index-document index.html --error-document index.html

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host " ✔ AWS Resources Provisioned Successfully!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host "Update your server/.env with:" -ForegroundColor Yellow
Write-Host "AWS_REGION=$Region" -ForegroundColor White
Write-Host "AWS_S3_BUCKET=$mediaBucketName" -ForegroundColor White
Write-Host "`nFrontend Static Bucket: s3://$frontendBucketName" -ForegroundColor White
Write-Host "To deploy frontend:" -ForegroundColor Cyan
Write-Host "  npm run build --prefix client" -ForegroundColor White
Write-Host "  aws s3 sync client/dist s3://$frontendBucketName" -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Green
