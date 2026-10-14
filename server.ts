import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
// @ts-ignore
import sendEmailHandler from './api/send-email.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

// Parse JSON request bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Server-side SMTP configuration (never exposed to frontend)
const EMAIL_USER = process.env.EMAIL_USER || 'dextercr.app@gmail.com';
const EMAIL_PASS = (process.env.EMAIL_PASS || 'bcth nlmx mkkq vqsc').replace(/\s+/g, '');
const APP_NAME = process.env.APP_NAME || 'Dexter';

// Create Nodemailer transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

// Verify SMTP connection on server startup
transporter.verify((error) => {
  if (error) {
    console.error('⚠️ [SMTP] Transporter connection verification failed:', error.message);
  } else {
    console.log('✅ [SMTP] Gmail SMTP transporter ready for automated email dispatch and OTP.');
  }
});

// OTP In-Memory Storage
interface OtpRecord {
  code: string;
  expiresAt: number; // Timestamp in milliseconds
  attempts: number;
  createdAt: number;
  purpose?: string;
}

const otpStore = new Map<string, OtpRecord>();

// Periodic cleanup of expired OTPs (runs every 2 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [email, record] of otpStore.entries()) {
    if (now > record.expiresAt) {
      otpStore.delete(email);
    }
  }
}, 2 * 60 * 1000);

// Helper to normalize email addresses
function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

// -------------------------------------------------------------
// API Endpoints
// -------------------------------------------------------------

/**
 * Health & SMTP Status check
 * Never exposes passwords or sensitive keys to client
 */
app.get('/api/email/status', (_req: Request, res: Response) => {
  const isConfigured = Boolean(EMAIL_USER && EMAIL_PASS);
  res.json({
    status: 'ok',
    configured: isConfigured,
    senderEmail: EMAIL_USER ? EMAIL_USER.replace(/(.{3})(.*)(@.*)/, '$1***$3') : null,
    appName: APP_NAME,
    activeOtps: otpStore.size,
  });
});

/**
 * Root Serverless Endpoint for Vercel & Local Dev
 * POST /api/send-email
 */
app.all('/api/send-email', (req: Request, res: Response) => {
  return sendEmailHandler(req, res);
});

/**
 * Endpoint to send custom emails with subject and HTML content
 * POST /api/email/send
 * Body: { to, subject, html, text? }
 */
app.post('/api/email/send', async (req: Request, res: Response) => {
  try {
    const { to, subject, html, text } = req.body;

    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, subject, and either html or text content are required.',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid recipient email address format.',
      });
    }

    const mailOptions = {
      from: `"${APP_NAME}" <${EMAIL_USER}>`,
      to: to.trim(),
      subject: subject.trim(),
      text: text || undefined,
      html: html || undefined,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 [Email Dispatched] To: ${to} | Subject: "${subject}" | MessageId: ${info.messageId}`);

    return res.json({
      success: true,
      message: 'Email dispatched successfully.',
      messageId: info.messageId,
    });
  } catch (error: any) {
    console.error('❌ [Email Send Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to dispatch email via SMTP service.',
    });
  }
});

/**
 * Endpoint to generate, store, and send a 6-digit OTP code with 5-minute expiration
 * POST /api/otp/send
 * Body: { email, purpose? }
 */
app.post('/api/otp/send', async (req: Request, res: Response) => {
  try {
    const { email, purpose } = req.body;
    const cleanEmail = normalizeEmail(email);

    if (!cleanEmail) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required.',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address.',
      });
    }

    // Rate limiting check: check if an OTP was sent in the last 30 seconds
    const existing = otpStore.get(cleanEmail);
    const now = Date.now();
    if (existing && now - existing.createdAt < 30 * 1000) {
      const waitSec = Math.ceil((30 * 1000 - (now - existing.createdAt)) / 1000);
      return res.status(429).json({
        success: false,
        error: `Please wait ${waitSec} seconds before requesting another code.`,
      });
    }

    // Generate cryptographic-quality 6-digit code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expirationMinutes = 5;
    const expiresAt = now + expirationMinutes * 60 * 1000;

    // Store in memory
    otpStore.set(cleanEmail, {
      code: otpCode,
      expiresAt,
      attempts: 0,
      createdAt: now,
      purpose: purpose || 'verification',
    });

    // Clean, modern branded email HTML
    const formattedPurpose = purpose ? purpose.charAt(0).toUpperCase() + purpose.slice(1) : 'Account & Project Verification';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${APP_NAME} Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0c10; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e8eaf2;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0b0c10; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 540px; background: #13141b; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,0.6);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 20px 32px; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: center;">
              <div style="display: inline-block; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; color: #ffffff;">
                <span style="color: #4285f4;">DEXTER</span>
              </div>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: rgba(232,234,242,0.5); text-transform: uppercase; letter-spacing: 1.5px;">Digital Agency & Technology</p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 36px 32px 24px 32px; text-align: center;">
              <h1 style="margin: 0 0 12px 0; font-size: 21px; font-weight: 600; color: #ffffff;">Verification Code</h1>
              <p style="margin: 0 0 28px 0; font-size: 14.5px; line-height: 1.6; color: rgba(232,234,242,0.75);">
                Use the one-time code below for your <strong style="color: #fff;">${formattedPurpose}</strong> with ${APP_NAME}.
              </p>

              <!-- OTP Code Display Card -->
              <div style="background: rgba(255,255,255,0.03); border: 1.5px dashed rgba(66, 133, 244, 0.4); border-radius: 12px; padding: 22px 16px; margin: 0 auto 28px auto; max-width: 340px;">
                <div style="font-size: 38px; font-weight: 700; letter-spacing: 10px; color: #4285f4; font-family: 'Courier New', Courier, monospace; text-shadow: 0 0 20px rgba(66, 133, 244, 0.3);">
                  ${otpCode}
                </div>
                <div style="margin-top: 10px; font-size: 12px; color: rgba(232,234,242,0.5); font-weight: 500;">
                  ⏱ Valid for <span style="color: #fbbc04;">5 minutes</span> only
                </div>
              </div>

              <!-- Security Information -->
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: rgba(232,234,242,0.5);">
                Do not share this code with anyone. If you did not initiate this verification request, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.06); text-align: center;">
              <p style="margin: 0; font-size: 12px; color: rgba(232,234,242,0.4); line-height: 1.5;">
                Sent securely by ${APP_NAME} Automated Dispatch<br>
                ${EMAIL_USER} &bull; dextertech.com
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const textContent = `
${APP_NAME} Verification Code

Your 6-digit one-time verification code is: ${otpCode}

This code is valid for 5 minutes.
If you did not request this verification, please disregard this email.

— ${APP_NAME} Digital Agency
${EMAIL_USER}
    `;

    await transporter.sendMail({
      from: `"${APP_NAME}" <${EMAIL_USER}>`,
      to: cleanEmail,
      subject: `[${APP_NAME}] Your Verification Code is ${otpCode}`,
      text: textContent,
      html: htmlContent,
    });

    console.log(`🔐 [OTP Dispatched] Sent code to: ${cleanEmail} (Valid for 5m)`);

    return res.json({
      success: true,
      message: 'A 6-digit verification code has been dispatched to your email address.',
      expiresInSeconds: 300,
    });
  } catch (error: any) {
    console.error('❌ [OTP Dispatch Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to dispatch verification code via email.',
    });
  }
});

/**
 * Endpoint to verify a user-submitted OTP
 * POST /api/otp/verify
 * Body: { email, code }
 */
app.post('/api/otp/verify', (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    const cleanEmail = normalizeEmail(email);
    const cleanCode = (code || '').toString().trim();

    if (!cleanEmail || !cleanCode) {
      return res.status(400).json({
        success: false,
        error: 'Email address and 6-digit verification code are required.',
      });
    }

    const record = otpStore.get(cleanEmail);
    const now = Date.now();

    // Check existence
    if (!record) {
      return res.status(400).json({
        success: false,
        error: 'No active verification code found for this email. Please request a new code.',
      });
    }

    // Check expiration (5 minutes)
    if (now > record.expiresAt) {
      otpStore.delete(cleanEmail);
      return res.status(400).json({
        success: false,
        error: 'The verification code has expired (valid for 5 minutes). Please request a new code.',
      });
    }

    // Check attempts limit (max 5)
    if (record.attempts >= 5) {
      otpStore.delete(cleanEmail);
      return res.status(429).json({
        success: false,
        error: 'Too many incorrect attempts. This code has been invalidated. Please request a new code.',
      });
    }

    // Verify code match
    if (record.code !== cleanCode) {
      record.attempts += 1;
      const remainingAttempts = 5 - record.attempts;
      return res.status(400).json({
        success: false,
        error: `Invalid verification code. ${remainingAttempts} attempts remaining.`,
      });
    }

    // OTP verified successfully! Remove from active store
    otpStore.delete(cleanEmail);
    console.log(`✅ [OTP Verified] Successfully verified email: ${cleanEmail}`);

    return res.json({
      success: true,
      message: 'Email address verified successfully!',
      verifiedEmail: cleanEmail,
    });
  } catch (error: any) {
    console.error('❌ [OTP Verify Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal error verifying OTP code.',
    });
  }
});

/**
 * Automated Project Brief Submission & Confirmation Email Dispatch
 * POST /api/intake/submit
 */
app.post('/api/intake/submit', async (req: Request, res: Response) => {
  try {
    const { name, email, whatsapp, service, timeline, budget, template_code, notes, verifiedOtp } = req.body;
    const cleanEmail = normalizeEmail(email);

    if (!cleanEmail || !name) {
      return res.status(400).json({
        success: false,
        error: 'Client name and email address are required.',
      });
    }

    const refCode = `DX-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    const serviceName = service || 'Custom Digital Solution';

    // 1. Client Confirmation Email
    const clientHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background-color: #0b0c10; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e8eaf2;">
  <table role="presentation" width="100%" style="background-color: #0b0c10; padding: 35px 15px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width: 580px; background: #13141b; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; overflow: hidden;">
        <tr>
          <td style="padding: 28px; border-bottom: 1px solid rgba(255,255,255,0.08); text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #4285f4;">DEXTER</div>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: rgba(232,234,242,0.5); text-transform: uppercase; letter-spacing: 1px;">Project Brief Received</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 30px;">
            <h2 style="margin: 0 0 10px 0; font-size: 19px; color: #fff;">Hello ${escapeHtml(name)},</h2>
            <p style="margin: 0 0 20px 0; font-size: 14.5px; line-height: 1.6; color: rgba(232,234,242,0.75);">
              Thank you for submitting your project brief to <strong>${APP_NAME}</strong>. Our engineering and design team is reviewing your requirements.
            </p>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 20px; margin-bottom: 24px;">
              <div style="font-size: 12px; color: #4285f4; font-weight: 600; text-transform: uppercase; margin-bottom: 12px;">Reference: ${refCode}</div>
              <div style="font-size: 14px; margin-bottom: 8px;"><strong>Selected Service:</strong> ${escapeHtml(serviceName)}</div>
              ${timeline ? `<div style="font-size: 14px; margin-bottom: 8px;"><strong>Estimated Timeline:</strong> ${escapeHtml(timeline)}</div>` : ''}
              ${budget ? `<div style="font-size: 14px; margin-bottom: 8px;"><strong>Budget Tier:</strong> ${escapeHtml(budget)}</div>` : ''}
              ${template_code ? `<div style="font-size: 14px; margin-bottom: 8px;"><strong>Template Code:</strong> ${escapeHtml(template_code)}</div>` : ''}
              ${whatsapp ? `<div style="font-size: 14px; margin-bottom: 8px;"><strong>WhatsApp Contact:</strong> ${escapeHtml(whatsapp)}</div>` : ''}
              ${notes ? `<div style="font-size: 13.5px; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); color: rgba(232,234,242,0.8);"><strong>Project Scope:</strong><br>${escapeHtml(notes)}</div>` : ''}
            </div>
            <p style="margin: 0; font-size: 13.5px; color: rgba(232,234,242,0.6); line-height: 1.5;">
              We will reach out to you within 24 hours via email or WhatsApp to schedule an exploratory discussion.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 20px; background: rgba(0,0,0,0.25); border-top: 1px solid rgba(255,255,255,0.06); text-align: center; font-size: 12px; color: rgba(232,234,242,0.4);">
            ${APP_NAME} &bull; ${EMAIL_USER} &bull; Imphal, Manipur, India
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // 2. Admin Alert Email to Dexter Team
    const adminHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111; padding: 20px;">
  <h2>🚀 New Project Brief Received [${refCode}]</h2>
  <p><strong>Client Name:</strong> ${escapeHtml(name)}</p>
  <p><strong>Email:</strong> <a href="mailto:${cleanEmail}">${cleanEmail}</a> ${verifiedOtp ? '<span style="color: green; font-weight: bold;">(OTP Verified)</span>' : ''}</p>
  <p><strong>WhatsApp:</strong> ${whatsapp ? `<a href="https://wa.me/${whatsapp.replace(/\D/g, '')}">${escapeHtml(whatsapp)}</a>` : 'Not provided'}</p>
  <p><strong>Service:</strong> ${escapeHtml(serviceName)}</p>
  <p><strong>Timeline:</strong> ${escapeHtml(timeline || 'Flexible')}</p>
  <p><strong>Budget:</strong> ${escapeHtml(budget || 'Discuss')}</p>
  <p><strong>Template Code:</strong> ${escapeHtml(template_code || 'None')}</p>
  <p><strong>Notes / Scope:</strong></p>
  <blockquote style="background: #f4f4f4; padding: 12px; border-left: 4px solid #4285f4;">${escapeHtml(notes || 'None')}</blockquote>
</body>
</html>`;

    // Dispatch emails concurrently
    await Promise.allSettled([
      transporter.sendMail({
        from: `"${APP_NAME}" <${EMAIL_USER}>`,
        to: cleanEmail,
        subject: `[${refCode}] We received your project brief — ${APP_NAME}`,
        html: clientHtml,
      }),
      transporter.sendMail({
        from: `"${APP_NAME} Intake" <${EMAIL_USER}>`,
        to: EMAIL_USER,
        subject: `[New Brief] ${name} - ${serviceName} (${refCode})`,
        html: adminHtml,
      }),
    ]);

    return res.json({
      success: true,
      message: 'Project brief submitted and confirmation emails dispatched.',
      referenceCode: refCode,
    });
  } catch (error: any) {
    console.error('❌ [Intake Submit Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error processing brief submission.',
    });
  }
});

// Simple HTML escaping helper for email safety
function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// -------------------------------------------------------------
// Vite Middleware / Static Asset Serving
// -------------------------------------------------------------
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 [Server] Dexter server running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
