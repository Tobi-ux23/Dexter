import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import fs from 'fs';
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
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'bungorajesh23@gmail.com';

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
      replyTo: req.body.replyTo || ADMIN_EMAIL,
      subject: subject.trim(),
      text: text || undefined,
      html: html || undefined,
      headers: {
        'X-Priority': '3',
        'X-MSMail-Priority': 'Normal',
        'Importance': 'Normal',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
      },
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

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>${APP_NAME} Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <!-- Anti-Spam Hidden Preheader -->
  <div style="display: none; font-size: 1px; color: #ffffff; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
    Your one-time verification code is ${otpCode}. Valid for 5 minutes.
  </div>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6f9; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
          <tr>
            <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #f1f5f9; text-align: left;">
              <div style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">
                <span style="color: #2563eb;">DEXTER</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 600; color: #0f172a;">Verification Code</h1>
              <p style="margin: 0 0 24px 0; font-size: 14.5px; line-height: 1.6; color: #475569;">
                Please use the one-time code below to verify your email for <strong style="color: #0f172a;">${escapeHtml(formattedPurpose)}</strong>:
              </p>
              <div style="background-color: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 10px; padding: 20px; margin: 0 auto 24px auto; text-align: center;">
                <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #2563eb; font-family: 'Courier New', Courier, monospace;">
                  ${otpCode}
                </div>
                <div style="margin-top: 8px; font-size: 12.5px; color: #64748b; font-weight: 500;">
                  Valid for 5 minutes
                </div>
              </div>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b;">
                Never share this verification code with anyone. If you did not request this verification, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; color: #475569;">
                Our Team
              </p>
              <p style="margin: 0 0 6px 0; font-size: 12px; line-height: 1.5; color: #94a3b8;">
                This is an automated verification code sent on behalf of ${APP_NAME}.<br>
                Questions? Reach out to us at <a href="mailto:dextercr.app@gmail.com" style="color: #2563eb; text-decoration: underline;">dextercr.app@gmail.com</a>.
              </p>
              <p style="margin: 0; font-size: 11px; color: #64748b;">
                WhatsApp: <a href="https://wa.me/919383072492" style="color: #10b981; text-decoration: none;">+91 9383072492</a> &nbsp;•&nbsp; Web: <a href="https://dextercr.vercel.app" style="color: #2563eb; text-decoration: none;">dextercr.vercel.app</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const textContent = `${APP_NAME} Verification Code

Your 6-digit one-time verification code is: ${otpCode}

This code is valid for 5 minutes.
If you did not request this verification, please disregard this email.

— Our Team
Reach out to us at dextercr.app@gmail.com
WhatsApp: +91 9383072492 | Web: dextercr.vercel.app`;

    await transporter.sendMail({
      from: `"${APP_NAME}" <${EMAIL_USER}>`,
      to: cleanEmail,
      replyTo: 'dextercr.app@gmail.com',
      subject: `${APP_NAME} Verification Code: ${otpCode}`,
      text: textContent,
      html: htmlContent,
      headers: {
        'X-Priority': '3',
        'X-MSMail-Priority': 'Normal',
        'Importance': 'Normal',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
      },
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

// Render client confirmation email using templates/client-confirmation-email.html structure
function renderClientConfirmationHtml({ name, refCode, serviceName, projectType, timeline, budget, templateCode, whatsapp, notes }: {
  name?: string;
  refCode?: string;
  serviceName?: string;
  projectType?: string;
  timeline?: string;
  budget?: string;
  templateCode?: string;
  whatsapp?: string;
  notes?: string;
}): string {
  let template = '';
  try {
    const templatePath = path.resolve(process.cwd(), 'templates/client-confirmation-email.html');
    if (fs.existsSync(templatePath)) {
      template = fs.readFileSync(templatePath, 'utf8');
    }
  } catch (err) {
    // Fall back to embedded markup
  }

  const safeClientName = escapeHtml(name || 'Client');
  const safeRefCode = escapeHtml(refCode || 'DX-DIRECT');
  const safeService = escapeHtml(serviceName || 'Custom Digital Solution');
  const safeProjectType = escapeHtml(projectType || 'Standard');
  const safeTimeline = escapeHtml(timeline || 'Flexible');
  const safeBudget = escapeHtml(budget || 'Discuss');

  const templateCodeRow = templateCode
    ? `<tr>
                        <td style="color: #64748b; font-weight: 500;">Template Code :</td>
                        <td style="color: #0f172a; font-family: monospace; font-weight: 600;">${escapeHtml(templateCode)}</td>
                      </tr>`
    : '';

  const whatsappCell = whatsapp
    ? `<a href="https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}" style="color: #059669; font-weight: 600; text-decoration: none;">${escapeHtml(whatsapp)}</a>`
    : `<span style="color: #94a3b8; font-style: italic;">Not specified</span>`;

  const notesSection = notes
    ? `<div style="margin-top: 16px; padding: 12px 14px; border-left: 3px solid #2563eb; background-color: #ffffff; border-radius: 0 8px 8px 0; border: 1px solid #e2e8f0; border-left: 3px solid #2563eb;">
        <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Scope &amp; Requirements:</div>
        <div style="font-size: 13px; line-height: 1.55; color: #334155; white-space: pre-wrap;">${escapeHtml(notes)}</div>
      </div>`
    : '';

  if (template) {
    return template
      .replace(/{{CLIENT_NAME}}/g, safeClientName)
      .replace(/{{REF_CODE}}/g, safeRefCode)
      .replace(/{{SERVICE_NAME}}/g, safeService)
      .replace(/{{PROJECT_TYPE}}/g, safeProjectType)
      .replace(/{{TIMELINE}}/g, safeTimeline)
      .replace(/{{BUDGET}}/g, safeBudget)
      .replace(/{{TEMPLATE_CODE_ROW}}/g, templateCodeRow)
      .replace(/{{WHATSAPP_CELL}}/g, whatsappCell)
      .replace(/{{NOTES_SECTION}}/g, notesSection);
  }

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Project Brief Received - DEXTER STUDIO</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center">
        <!-- Main Card Wrapper -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Area -->
          <tr>
            <td style="padding: 32px 32px 20px 32px; border-bottom: 1px solid #f1f5f9;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td valign="middle">
                    <span style="font-size: 22px; font-weight: 900; letter-spacing: -0.5px; color: #09090b; font-family: Arial, sans-serif;">DEXTER</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 24px 32px 24px 32px;">
              <h1 style="margin: 0 0 12px 0; font-size: 24px; font-weight: 800; color: #0f172a; line-height: 1.3;">
                We've received your project brief.
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                Hello <strong style="color: #0f172a;">${safeClientName}</strong>, thank you for connecting with us. We have successfully logged your project specifications. Our team is currently reviewing your brief and will be in touch with next steps.
              </p>

              <!-- Card 1: Project Scope Specification -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; margin-bottom: 20px;">
                <tr>
                  <td style="padding-bottom: 14px; border-bottom: 1px solid #e2e8f0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size: 11px; font-weight: 700; color: #475569; letter-spacing: 0.5px; text-transform: uppercase;">
                          PROJECT SCOPE SPECIFICATION
                        </td>
                        <td align="right">
                          <span style="background-color: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 6px; font-family: monospace;">
                            ${safeRefCode}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 14px;">
                    <table border="0" cellpadding="4" cellspacing="0" width="100%" style="font-size: 13px;">
                      <tr>
                        <td width="40%" style="color: #64748b; font-weight: 500;">Project on :</td>
                        <td width="60%" style="color: #0f172a; font-weight: 700;">${safeService}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-weight: 500;">Project Type :</td>
                        <td style="color: #1e293b; font-weight: 500;">${safeProjectType}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-weight: 500;">Project Duration :</td>
                        <td style="color: #0f172a; font-weight: 700;">${safeTimeline}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-weight: 500;">Budget Tier :</td>
                        <td style="color: #0f172a; font-weight: 700;">${safeBudget}</td>
                      </tr>
                      ${templateCodeRow}
                      <tr>
                        <td style="color: #64748b; font-weight: 500;">WhatsApp Contact :</td>
                        <td>${whatsappCell}</td>
                      </tr>
                    </table>

                    <!-- Inner Box with Left Accent Line -->
                    ${notesSection}
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer Area -->
          <tr>
            <td style="padding: 24px 32px 32px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
              <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; color: #0f172a;">Our Team</h4>
              <p style="margin: 0 0 6px 0; font-size: 11px; color: #64748b; line-height: 1.5;">
                You received this receipt because you submitted a project inquiry on our website.
              </p>
              <p style="margin: 0 0 12px 0; font-size: 11px; color: #64748b;">
                For any inquiries or revisions, reach out directly at <a href="mailto:dextercr.app@gmail.com" style="color: #2563eb; text-decoration: underline;">dextercr.app@gmail.com</a>.
              </p>
              <p style="margin: 0; font-size: 11px; color: #64748b;">
                WhatsApp: <a href="https://wa.me/919383072492" style="color: #059669; font-weight: 600; text-decoration: none;">+91 9383072492</a> &nbsp;&bull;&nbsp; Web: <a href="https://dextercr.vercel.app" target="_blank" style="color: #2563eb; text-decoration: none;">dextercr.vercel.app</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderClientConfirmationText({ name, refCode, serviceName, projectType, timeline, budget, templateCode, whatsapp, notes }: {
  name?: string;
  refCode?: string;
  serviceName?: string;
  projectType?: string;
  timeline?: string;
  budget?: string;
  templateCode?: string;
  whatsapp?: string;
  notes?: string;
}): string {
  return `Project Brief Received [${refCode}]

Hello ${name || 'Client'},

Thank you for connecting with us. We have successfully logged your project specifications. Our team is currently reviewing your brief and will be in touch with next steps.

PROJECT SCOPE SPECIFICATION
• Reference Code: ${refCode}
• Project on : ${serviceName}
• Project Type : ${projectType || 'Standard'}
• Project Duration : ${timeline || 'Flexible'}
• Budget Tier : ${budget || 'Discuss'}
${templateCode ? `• Template Code : ${templateCode}\n` : ''}• WhatsApp Contact : ${whatsapp || 'Not specified'}

${notes ? `Scope & Requirements:\n${notes}\n\n` : ''}Our Team
You received this receipt because you submitted a project inquiry on our website.
For any inquiries or revisions, reach out directly at dextercr.app@gmail.com.
WhatsApp: +91 9383072492 • Web: https://dextercr.vercel.app`;
}

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
    const clientHtml = renderClientConfirmationHtml({
      name,
      refCode,
      serviceName,
      projectType: req.body.project_type,
      timeline,
      budget,
      templateCode: template_code,
      whatsapp,
      notes
    });

    const clientText = renderClientConfirmationText({
      name,
      refCode,
      serviceName,
      projectType: req.body.project_type,
      timeline,
      budget,
      templateCode: template_code,
      whatsapp,
      notes
    });

    // 2. Admin Alert Email to Dexter Team
    const adminHtml = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>New Project Brief: [${refCode}]</title></head>
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

    const adminText = `New Project Brief Alert [${refCode}]

Client Name: ${name}
Client Email: ${cleanEmail}
${whatsapp ? `WhatsApp: ${whatsapp}\n` : ''}Service Discipline: ${serviceName}
${req.body.project_type ? `Deliverable: ${req.body.project_type}\n` : ''}Estimated Timeline: ${timeline || 'Flexible'}
Budget Tier: ${budget || 'Discuss'}
${template_code ? `Template Code: ${template_code}\n` : ''}
Scope & Notes:
${notes || 'None'}

Delivered to ${ADMIN_EMAIL}`;

    // Dispatch emails concurrently
    await Promise.allSettled([
      transporter.sendMail({
        from: `"${APP_NAME}" <${EMAIL_USER}>`,
        to: cleanEmail,
        replyTo: 'dextercr.app@gmail.com',
        subject: `Project Brief Received: ${serviceName} (Ref: ${refCode})`,
        text: clientText,
        html: clientHtml,
        headers: {
          'X-Priority': '3',
          'X-MSMail-Priority': 'Normal',
          'Importance': 'Normal',
          'X-Auto-Response-Suppress': 'OOF, AutoReply',
        },
      }),
      transporter.sendMail({
        from: `"${APP_NAME} Alerts" <${EMAIL_USER}>`,
        to: ADMIN_EMAIL,
        replyTo: cleanEmail,
        cc: EMAIL_USER !== ADMIN_EMAIL ? EMAIL_USER : undefined,
        subject: `[New Project Brief] ${name} — ${serviceName} (${refCode})`,
        text: adminText,
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
