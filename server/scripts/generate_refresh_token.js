/**
 * Gmail OAuth2 Refresh Token Generator
 * =====================================
 * Run this ONCE to authorize SmartWaste to send OTP emails through your Gmail account.
 *
 * Usage:
 *   node server/scripts/generate_refresh_token.js
 *
 * Prerequisites:
 *   - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in server/.env
 *   - In Google Cloud Console → APIs & Services → Credentials:
 *       Add "http://localhost:3333/oauth2callback" as an Authorized redirect URI
 *   - In Google Cloud Console → APIs & Services → Library:
 *       Enable the "Gmail API"
 */

import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');

dotenv.config({ path: envPath });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3333/oauth2callback';
const SCOPES = 'https://mail.google.com/';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n❌ GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in server/.env');
  console.error('   Please add them and re-run this script.\n');
  process.exit(1);
}

// Build Google OAuth2 authorization URL
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

console.log('\n======================================================================');
console.log('  🔑 SmartWaste Gmail OAuth2 Refresh Token Generator');
console.log('======================================================================');
console.log('\n  Opening your browser to authorize Gmail access...');
console.log('  If the browser does not open, visit this URL manually:\n');
console.log(`  ${authUrl.toString()}\n`);

// Open browser (cross-platform)
const openCommand = process.platform === 'win32'
  ? `start "" "${authUrl.toString()}"`
  : process.platform === 'darwin'
    ? `open "${authUrl.toString()}"`
    : `xdg-open "${authUrl.toString()}"`;

exec(openCommand, (err) => {
  if (err) {
    console.log('  ⚠️  Could not open browser automatically. Please open the URL above manually.');
  }
});

// Start local server to handle OAuth2 callback
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:3333`);

  if (reqUrl.pathname === '/oauth2callback') {
    const code = reqUrl.searchParams.get('code');
    const error = reqUrl.searchParams.get('error');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#dc2626">❌ Authorization Failed</h2>
        <p>Error: ${error}</p>
        <p>Please try again.</p>
      </body></html>`);
      server.close();
      process.exit(1);
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#dc2626">❌ No authorization code received</h2>
      </body></html>`);
      return;
    }

    try {
      // Exchange authorization code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code'
        })
      });

      const tokens = await tokenResponse.json();

      if (tokens.error) {
        throw new Error(`${tokens.error}: ${tokens.error_description || 'Unknown error'}`);
      }

      if (!tokens.refresh_token) {
        throw new Error('No refresh token received. Try revoking app access at https://myaccount.google.com/permissions and re-running.');
      }

      // Save refresh token to .env file
      let envContent = '';
      try {
        envContent = fs.readFileSync(envPath, 'utf-8');
      } catch { /* file doesn't exist yet */ }

      // Replace or append GOOGLE_REFRESH_TOKEN
      if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
        envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/g, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      } else {
        envContent = envContent.trimEnd() + `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
      }

      fs.writeFileSync(envPath, envContent);

      console.log('\n  ✅ Refresh token obtained and saved to server/.env');
      console.log(`  🔑 Token: ${tokens.refresh_token.substring(0, 20)}...`);
      console.log('\n  You can now close this tab and start the server.');
      console.log('  OTP emails will be delivered to real inboxes!\n');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html>
        <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:center;padding:60px;background:#f8fafc">
          <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:40px;box-shadow:0 4px 12px rgba(0,0,0,0.08);border:1px solid #e2e8f0">
            <div style="font-size:48px;margin-bottom:16px">✅</div>
            <h2 style="color:#065f46;margin:0 0 8px 0">Authorization Successful!</h2>
            <p style="color:#475569;font-size:14px;line-height:1.6">
              Gmail OAuth2 refresh token has been saved to <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">server/.env</code>
            </p>
            <p style="color:#64748b;font-size:13px;margin-top:16px">
              You can close this tab and restart the SmartWaste server.<br>
              OTP emails will now be delivered to real inboxes.
            </p>
          </div>
        </body>
      </html>`);

      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 2000);

    } catch (err) {
      console.error('\n  ❌ Token exchange failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#dc2626">❌ Token Exchange Failed</h2>
        <p>${err.message}</p>
      </body></html>`);
    }
  }
});

server.listen(3333, () => {
  console.log('  🖥️  Callback server listening on http://localhost:3333\n');
});
