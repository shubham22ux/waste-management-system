# ☁️ SmartWaste: AWS Cloud Integration & Deployment Guide

This guide details how to deploy the **SmartWaste** municipal solid waste management and fleet route optimization platform onto Amazon Web Services (AWS).

---

## 🏛️ Architecture Overview

The SmartWaste system uses a dual-layer cloud architecture:

```
                          ┌───────────────────────────┐
                          │   Citizens & Fleet Admins │
                          └─────────────┬─────────────┘
                                        │
                                        ▼ HTTPS / WSS
               ┌─────────────────────────────────────────────────┐
               │              AWS CloudFront (CDN)               │
               │        (Global Caching, SSL Termination)        │
               └────────┬───────────────────────────────┬────────┘
                        │ / (Static)                    │ /api/* & /socket.io/*
                        ▼                               ▼
       ┌────────────────────────────────┐     ┌────────────────────────────────┐
       │   Amazon S3 (Frontend Bucket)  │     │       AWS Compute Layer        │
       │    Vite + React 19 + Tailwind  │     │   Express.js + Socket.IO API   │
       │                                │     │  (EC2 / App Runner / ECS)      │
       └────────────────────────────────┘     └────────┬──────────────┬────────┘
                                                       │              │
                        ┌──────────────────────────────┘              │
                        ▼                                             ▼
       ┌────────────────────────────────┐              ┌───────────────────────┐
       │   Amazon S3 (Media Bucket)     │              │   AWS Database Layer  │
       │ Citizen Grievance Photos &     │              │ • MongoDB Atlas or    │
       │ Fleet Evidence Files           │              │   Amazon DocumentDB   │
       │ + Amazon Rekognition AI        │              │ • Embedded SQLite WAL │
       └────────────────────────────────┘              └───────────────────────┘
```

---

## ⚡ Quick Start: Automatic Cloud Resource Provisioning

We provide automated setup scripts in the `aws/` directory:

### On Windows (PowerShell):
```powershell
powershell -ExecutionPolicy Bypass -File .\aws\setup-aws-resources.ps1 -Region us-east-1
```

### On Linux / macOS / CloudShell (Bash):
```bash
chmod +x aws/setup-aws-resources.sh
./aws/setup-aws-resources.sh us-east-1
```

This automatically:
1. Creates the S3 Media bucket for complaint photos.
2. Applies the necessary Public Access and CORS policies.
3. Creates the S3 Frontend static website bucket.
4. Outputs the exact bucket names and region to put into your `.env`.

---

## 📦 Component 1: Amazon S3 Cloud Storage Integration

The server uses a hybrid storage service ([storageService.js](file:///d:/CAD_PROJECT/server/src/services/storageService.js)). When AWS credentials and bucket name are set in `server/.env`, uploads are pushed to S3. When absent, it smoothly falls back to local disk storage (`uploads/`).

### Step 1: Create IAM User for Server
In the AWS Console:
1. Go to **IAM** > **Users** > **Create user** (e.g., `smartwaste-server-user`).
2. Attach the following inline policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:PutObjectAcl"
      ],
      "Resource": "arn:aws:s3:::YOUR_S3_MEDIA_BUCKET_NAME/*"
    },
    {
      "Effect": "Allow",
      "Action": ["rekognition:DetectLabels"],
      "Resource": "*"
    }
  ]
}
```
3. Go to **Security credentials** > **Create access key**.
4. Save the **Access Key ID** and **Secret Access Key**.

### Step 2: Configure Server `.env`
Create or edit `server/.env`:
```env
PORT=5000
NODE_ENV=production
MONGODB_URI=mongodb://127.0.0.1:27017/smartwaste

# AWS Credentials & Region
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# S3 Bucket for Grievance Photos
AWS_S3_BUCKET=smartwaste-media-123456789012-5821

# Optional: Amazon Rekognition AI photo verification
AWS_ENABLE_REKOGNITION=true
```

---

## 🚀 Deployment Strategy 1: AWS EC2 (Dockerized - Recommended for Free Tier & Full Stack)

This is the most cost-effective approach (~$0 on AWS Free Tier or ~$5/month with `t3.micro` / `t4g.small`). Because SmartWaste uses **Socket.IO WebSockets** and an active **IoT telemetry simulator**, running a Docker stack on an EC2 instance provides maximum compatibility with zero WebSocket timeout issues.

### 1. Launch an EC2 Instance
- **AMI**: Ubuntu Server 24.04 LTS
- **Instance Type**: `t3.small` (recommended, 2GB RAM) or `t2.micro` / `t3.micro` (Free Tier)
- **Storage**: 20 GB gp3 SSD
- **Security Group Inbound Rules**:
  - `SSH` (Port 22) from your IP
  - `HTTP` (Port 80) from `0.0.0.0/0`
  - `HTTPS` (Port 443) from `0.0.0.0/0`
  - `Express/Socket.IO` (Port 5000) from `0.0.0.0/0` (if accessing directly)

### 2. Connect and Install Docker
SSH into your instance:
```bash
ssh -i your-key.pem ubuntu@your-ec2-public-ip
```
Install Docker & Docker Compose:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker ubuntu
newgrp docker
```

### 3. Clone Repository & Run
```bash
git clone https://github.com/your-org/CAD_PROJECT.git
cd CAD_PROJECT

# Create server .env
cp server/.env.example server/.env
nano server/.env
# (Fill in your AWS S3 bucket, keys, and MongoDB URI or leave default)

# Start entire full stack in production mode
docker compose up -d --build
```

### 4. Verify Services
Check running containers:
```bash
docker compose ps
docker compose logs -f server
```
Test health check:
```bash
curl http://localhost:5000/api/health
```
You will receive:
```json
{
  "status": "ok",
  "message": "SmartWaste Express Backend is running",
  "aws": {
    "s3Storage": "connected",
    "s3Bucket": "smartwaste-media-...",
    "rekognition": "enabled"
  }
}
```

---

## 🌐 Deployment Strategy 2: S3 + CloudFront (Frontend) & AWS App Runner (Backend)

For a modern serverless container setup:

### Frontend to Amazon S3 + CloudFront:
1. Build client bundle:
   ```bash
   cd client
   npm install
   npm run build
   ```
2. Upload to S3 static website bucket:
   ```bash
   aws s3 sync dist/ s3://YOUR_FRONTEND_BUCKET_NAME --delete
   ```
3. Create a CloudFront Distribution pointing to the S3 bucket:
   - Viewer Protocol Policy: **Redirect HTTP to HTTPS**
   - Custom Error Response: Map `403` and `404` to `/index.html` with HTTP 200 response (required for React Router).

### Backend to AWS App Runner:
1. Push `server/Dockerfile` to Amazon ECR (Elastic Container Registry).
2. Create an **App Runner Service** from the container image.
3. Configure Port `5000`.
4. Add environment variables (`MONGODB_URI`, `AWS_S3_BUCKET`, `AWS_REGION`, etc.).
5. App Runner provides an automated HTTPS URL (e.g., `https://xxxx.us-east-1.awsapprunner.com`).

---

## 🤖 Amazon Rekognition AI (Automated Grievance Classification)

SmartWaste includes native Amazon Rekognition integration in [rekognitionService.js](file:///d:/CAD_PROJECT/server/src/services/rekognitionService.js).

When a citizen uploads a grievance photo:
1. The server passes the image bytes to `rekognition.detectLabels()`.
2. Rekognition analyzes the image for labels: `Trash`, `Garbage`, `Waste`, `Dumpster`, `Litter`, `Debris`.
3. If waste is detected, the API returns the confidence score and identified labels.
4. If no AWS credentials are configured, the system gracefully bypasses the AI check, ensuring seamless offline local development.

---

## 🔒 Security Best Practices Checklist for AWS

- [x] **Least Privilege IAM**: Use IAM policies restricted only to the specific S3 bucket and Rekognition actions.
- [x] **Private Credentials**: Never commit `.env` files with secret keys to Git.
- [x] **CORS Configuration**: Restrict S3 CORS origins to your production domain name.
- [x] **HTTPS Everywhere**: Use CloudFront or Let's Encrypt (Certbot) on EC2 to enforce TLS 1.3 encryption.
- [x] **Health Check Endpoint**: `/api/health` monitors SQLite, MongoDB connection, and AWS connectivity in real time.
