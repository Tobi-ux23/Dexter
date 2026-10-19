import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

// Server-side environment variables for Gmail SMTP
const EMAIL_USER = process.env.EMAIL_USER || 'dextercr.app@gmail.com';
const EMAIL_PASS = (process.env.EMAIL_PASS || 'bcth nlmx mkkq vqsc').replace(/\s+/g, '');
const APP_NAME = process.env.APP_NAME || 'Dexter';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'bungorajesh23@gmail.com';

// Configure Nodemailer strictly inside this file with specified SMTP settings
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

// Shared in-memory OTP storage preserved across serverless container warm re-invocations
const otpStore = (globalThis._dexterOtpStore = globalThis._dexterOtpStore || new Map());

// Helper to normalize email addresses
function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

// Simple HTML escaping helper for email safety
function escapeHtml(str) {
  return (str || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Render client confirmation email using templates/client-confirmation-email.html structure
function renderClientConfirmationHtml({ name, refCode, serviceName, projectType, timeline, budget, templateCode, whatsapp, notes }) {
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

function renderClientConfirmationText({ name, refCode, serviceName, projectType, timeline, budget, templateCode, whatsapp, notes }) {
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

// Helper to send JSON responses consistently across Vercel serverless and Node HTTP
function sendResponse(res, statusCode, data) {
  if (typeof res.status === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

// Helper to parse JSON body if not pre-parsed by middleware
async function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => {
      resolve({});
    });
  });
}

/**
 * Root-level Vercel Serverless Function: /api/send-email
 * Handles POST requests for automated email dispatch and OTP verification.
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return sendResponse(res, 405, {
      success: false,
      error: 'Method not allowed. Only POST requests are supported.',
    });
  }

  try {
    const body = await parseBody(req);
    const action = body.action || body.type;

    // ─────────────────────────────────────────────────────────────
    // ACTION 1: OTP Generation & Dispatch via Gmail SMTP
    // ─────────────────────────────────────────────────────────────
    if (action === 'send-otp' || action === 'otp') {
      const email = normalizeEmail(body.email || body.to);
      const purpose = body.purpose || 'Verification';

      if (!email) {
        return sendResponse(res, 400, {
          success: false,
          error: 'Email address is required to dispatch verification code.',
        });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return sendResponse(res, 400, {
          success: false,
          error: 'Please enter a valid recipient email address.',
        });
      }

      // Rate limit check: wait at least 15s between requests for same email
      const now = Date.now();
      const existing = otpStore.get(email);
      if (existing && now - existing.createdAt < 15 * 1000) {
        const waitSec = Math.ceil((15 * 1000 - (now - existing.createdAt)) / 1000);
        return sendResponse(res, 429, {
          success: false,
          error: `Please wait ${waitSec} seconds before requesting another code.`,
        });
      }

      // Generate 6-digit numeric verification code
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expirationMinutes = 5;
      const expiresAt = now + expirationMinutes * 60 * 1000;

      // Store in memory with 5-minute expiration
      otpStore.set(email, {
        code: otpCode,
        expiresAt,
        attempts: 0,
        createdAt: now,
        purpose,
      });

      const formattedPurpose = purpose.charAt(0).toUpperCase() + purpose.slice(1);

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

      const info = await transporter.sendMail({
        from: `"${APP_NAME}" <${EMAIL_USER}>`,
        to: email,
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

      console.log(`🔐 [OTP Dispatched] Code sent to ${email} (MessageId: ${info.messageId})`);

      return sendResponse(res, 200, {
        success: true,
        message: 'A 6-digit verification code has been dispatched to your email address.',
        expiresInSeconds: 300,
        messageId: info.messageId,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // ACTION 2: OTP Verification Check
    // ─────────────────────────────────────────────────────────────
    if (action === 'verify-otp' || action === 'verify') {
      const email = normalizeEmail(body.email || body.to);
      const code = (body.code || '').toString().trim();

      if (!email || !code) {
        return sendResponse(res, 400, {
          success: false,
          error: 'Email address and 6-digit verification code are required.',
        });
      }

      const record = otpStore.get(email);
      const now = Date.now();

      if (!record) {
        return sendResponse(res, 400, {
          success: false,
          error: 'No active verification code found for this email. Please request a new code.',
        });
      }

      if (now > record.expiresAt) {
        otpStore.delete(email);
        return sendResponse(res, 400, {
          success: false,
          error: 'The verification code has expired (valid for 5 minutes). Please request a new code.',
        });
      }

      if (record.attempts >= 5) {
        otpStore.delete(email);
        return sendResponse(res, 429, {
          success: false,
          error: 'Too many incorrect attempts. This code has been invalidated. Please request a new code.',
        });
      }

      if (record.code !== code) {
        record.attempts += 1;
        const remainingAttempts = 5 - record.attempts;
        return sendResponse(res, 400, {
          success: false,
          error: `Invalid verification code. ${remainingAttempts} attempts remaining.`,
        });
      }

      // Success: clean up code from store
      otpStore.delete(email);
      console.log(`✅ [OTP Verified] Successfully verified email: ${email}`);

      return sendResponse(res, 200, {
        success: true,
        message: 'Email address verified successfully!',
        verifiedEmail: email,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // ACTION 3: Project Brief Intake Submission Dispatch
    // ─────────────────────────────────────────────────────────────
    if (action === 'intake') {
      const { name, email, whatsapp, service, timeline, budget, template_code, notes, verifiedOtp } = body;
      const cleanEmail = normalizeEmail(email);

      if (!cleanEmail || !name) {
        return sendResponse(res, 400, {
          success: false,
          error: 'Client name and email address are required.',
        });
      }

      const refCode = `DX-${Date.now().toString(36).toUpperCase().slice(-5)}`;
      const serviceName = service || 'Custom Digital Solution';

      const clientHtml = renderClientConfirmationHtml({
        name,
        refCode,
        serviceName,
        projectType: body.project_type,
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
        projectType: body.project_type,
        timeline,
        budget,
        templateCode: template_code,
        whatsapp,
        notes
      });

      const adminHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Project Brief: [${refCode}]</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0c10; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e8eaf2;">
  <table role="presentation" width="100%" style="background-color: #0b0c10; padding: 35px 15px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width: 600px; background: #13141b; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; overflow: hidden; box-shadow: 0 16px 50px rgba(0,0,0,0.7);">
        <tr>
          <td style="padding: 28px 32px; background: linear-gradient(135deg, rgba(66,133,244,0.18) 0%, rgba(176,34,255,0.15) 100%); border-bottom: 1px solid rgba(255,255,255,0.08);">
            <div style="font-size: 13px; color: #8ab4f8; font-weight: 700; text-transform: letter-spacing: 1.5px; margin-bottom: 6px;">🔔 New Project Submission Alert</div>
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff;">${escapeHtml(serviceName)} </h1>
          </td>
        </tr>
        <tr>
          <td style="padding: 32px;">
            <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #e8eaf2;">
              A new client project brief has just been submitted on <strong>${APP_NAME}</strong>.
            </p>

            <table role="presentation" width="100%" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
              <tr><td style="padding: 6px 0; font-size: 14px; color: rgba(232,234,242,0.65); width: 140px;">Client Name:</td><td style="padding: 6px 0; font-size: 15px; font-weight: 600; color: #fff;">${escapeHtml(name)}</td></tr>
              <tr><td style="padding: 6px 0; font-size: 14px; color: rgba(232,234,242,0.65);">Client Email:</td><td style="padding: 6px 0; font-size: 14px; color: #4285f4; font-weight: 600;"><a href="mailto:${cleanEmail}" style="color: #4285f4; text-decoration: none;">${cleanEmail}</a></td></tr>
              ${whatsapp ? `<tr><td style="padding: 6px 0; font-size: 14px; color: rgba(232,234,242,0.65);">WhatsApp:</td><td style="padding: 6px 0; font-size: 14px; color: #25D366; font-weight: 600;"><a href="https://wa.me/${whatsapp.replace(/\\D/g, '')}" style="color: #25D366; text-decoration: none;">${escapeHtml(whatsapp)} (Open Chat ↗)</a></td></tr>` : ''}
              <tr><td style="padding: 6px 0; font-size: 14px; color: rgba(232,234,242,0.65);">Service Discipline:</td><td style="padding: 6px 0; font-size: 14px; font-weight: 600; color: #fff;">${escapeHtml(serviceName)}</td></tr>
              ${body.project_type ? `<tr><td style="padding: 6px 0; font-size: 14px; color: rgba(232,234,242,0.65);">Deliverable:</td><td style="padding: 6px 0; font-size: 14px; color: #fff;">${escapeHtml(body.project_type)}</td></tr>` : ''}
              ${timeline ? `<tr><td style="padding: 6px 0; font-size: 14px; color: rgba(232,234,242,0.65);">Estimated Timeline:</td><td style="padding: 6px 0; font-size: 14px; color: #fbbc04; font-weight: 600;">${escapeHtml(timeline)}</td></tr>` : ''}
              ${budget ? `<tr><td style="padding: 6px 0; font-size: 14px; color: rgba(232,234,242,0.65);">Budget Tier:</td><td style="padding: 6px 0; font-size: 14px; color: #34d399; font-weight: 600;">${escapeHtml(budget)}</td></tr>` : ''}
              ${template_code ? `<tr><td style="padding: 6px 0; font-size: 14px; color: rgba(232,234,242,0.65);">Template Code:</td><td style="padding: 6px 0; font-size: 14px; color: #fff; font-family: monospace;">${escapeHtml(template_code)}</td></tr>` : ''}
            </table>

            ${notes ? `
            <div style="margin-bottom: 24px;">
              <div style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: rgba(232,234,242,0.6); margin-bottom: 8px;">Client Scope & Vision Notes:</div>
              <div style="background: rgba(0,0,0,0.3); border-left: 3px solid #4285f4; border-radius: 4px; padding: 14px 16px; font-size: 14px; line-height: 1.6; color: #e8eaf2; white-space: pre-wrap;">${escapeHtml(notes)}</div>
            </div>` : ''}

            <!-- Quick Action Buttons -->
            <div style="margin-top: 28px;">
              <a href="mailto:${cleanEmail}?subject=Re:%20[${refCode}]%20Your%20Project%20Brief%20with%20${APP_NAME}" style="display: inline-block; background: #4285f4; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 13.5px; padding: 12px 22px; border-radius: 10px; margin-right: 10px;">Reply to Client ✉️</a>
              ${whatsapp ? `<a href="https://wa.me/${whatsapp.replace(/\\D/g, '')}?text=Hi%20${encodeURIComponent(name)}%2C%20thank%20you%20for%20your%20brief%20with%20Dexter%20(${refCode})" style="display: inline-block; background: #25D366; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 13.5px; padding: 12px 22px; border-radius: 10px;">WhatsApp Chat 💬</a>` : ''}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding: 20px 32px; background: rgba(0,0,0,0.35); border-top: 1px solid rgba(255,255,255,0.06); text-align: center; font-size: 12px; color: rgba(232,234,242,0.4);">
            Dexter Automated Admin Notification &bull; Delivered to ${ADMIN_EMAIL}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const adminText = `New Project Brief Alert [${refCode}]

Client Name: ${name}
Client Email: ${cleanEmail}
${whatsapp ? `WhatsApp: ${whatsapp}\n` : ''}Service Discipline: ${serviceName}
${body.project_type ? `Deliverable: ${body.project_type}\n` : ''}Estimated Timeline: ${timeline || 'Flexible'}
Budget Tier: ${budget || 'Discuss'}
${template_code ? `Template Code: ${template_code}\n` : ''}
Scope & Notes:
${notes || 'None'}

Delivered to ${ADMIN_EMAIL}`;

      console.log(`📨 [Intake Dispatch] Sending brief ${refCode} to Client: ${cleanEmail} & Admin: ${ADMIN_EMAIL}`);

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

      return sendResponse(res, 200, {
        success: true,
        message: 'Project brief submitted and confirmation emails dispatched.',
        referenceCode: refCode,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // ACTION 4: Custom / Direct Email Dispatch
    // ─────────────────────────────────────────────────────────────
    const to = (body.to || body.recipient || body.email || '').toString().trim();
    const subject = (body.subject || '').toString().trim();
    const html = body.html || (body.message ? `<p>${escapeHtml(body.message)}</p>` : undefined);
    const text = body.text || body.message || undefined;

    if (!to || !subject || (!html && !text)) {
      return sendResponse(res, 400, {
        success: false,
        error: 'Missing required fields: "to", "subject", and message content ("html" or "text") are required.',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return sendResponse(res, 400, {
        success: false,
        error: 'Invalid recipient email address format.',
      });
    }

    const mailOptions = {
      from: `"${APP_NAME}" <${EMAIL_USER}>`,
      to,
      replyTo: body.replyTo || ADMIN_EMAIL,
      subject,
      text,
      html,
      headers: {
        'X-Priority': '3',
        'X-MSMail-Priority': 'Normal',
        'Importance': 'Normal',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
      },
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 [Email Dispatched] To: ${to} | Subject: "${subject}" | MessageId: ${info.messageId}`);

    return sendResponse(res, 200, {
      success: true,
      message: 'Email dispatched successfully.',
      messageId: info.messageId,
    });
  } catch (error) {
    console.error('❌ [Send Email Error]:', error);
    return sendResponse(res, 500, {
      success: false,
      error: error.message || 'Failed to dispatch email via SMTP service.',
    });
  }
}
