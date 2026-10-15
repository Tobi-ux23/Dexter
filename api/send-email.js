import nodemailer from 'nodemailer';

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
                WhatsApp: <a href="https://wa.me/919366440834" style="color: #10b981; text-decoration: none;">+91 9366440834</a> &nbsp;•&nbsp; Web: <a href="https://dextercr.vercel.app" style="color: #2563eb; text-decoration: none;">dextercr.vercel.app</a>
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
WhatsApp: +91 9366440834 | Web: dextercr.vercel.app`;

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

      const clientHtml = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>Project Brief Confirmation [${refCode}] — ${APP_NAME}</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f8fafc; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .mobile-padding { padding-left: 20px !important; padding-right: 20px !important; }
      .mobile-stack { display: block !important; width: 100% !important; text-align: left !important; }
      .mobile-header-badge { margin-top: 10px !important; display: inline-block !important; }
      .mobile-spec-label { width: 100% !important; display: block !important; padding-bottom: 2px !important; }
      .mobile-spec-val { width: 100% !important; display: block !important; padding-bottom: 10px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased;">
  <!-- Anti-Spam Hidden Preheader -->
  <div style="display: none; font-size: 1px; color: #f8fafc; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
    We have received your project brief. Our team is reviewing your requirements and will reach out shortly. Reference: ${refCode}
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; width: 100%; margin: 0; padding: 40px 16px 48px 16px;">
    <tr>
      <td align="center">
        <!--[if (gte mso 9)|(IE)]>
        <table align="center" border="0" cellspacing="0" cellpadding="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);">

          <!-- Premium Brand Header -->
          <tr>
            <td class="mobile-padding" style="padding: 28px 36px 24px 36px; border-bottom: 1px solid #f1f5f9; background-color: #ffffff;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td valign="middle" class="mobile-stack">
                    <div style="display: inline-block; vertical-align: middle;">
                      <span style="font-size: 20px; font-weight: 800; letter-spacing: 0.12em; color: #0f172a; text-transform: uppercase;">DEXTER</span>
                      <span style="font-size: 11px; font-weight: 600; letter-spacing: 0.16em; color: #64748b; text-transform: uppercase; margin-left: 8px; vertical-align: middle;">STUDIO</span>
                    </div>
                  </td>
                  <td align="right" valign="middle" class="mobile-stack mobile-header-badge">
                    <span style="display: inline-block; padding: 5px 12px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: #047857; background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 9999px; text-transform: uppercase;">
                      ● Brief Received
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Editorial Greeting Section -->
          <tr>
            <td class="mobile-padding" style="padding: 36px 36px 24px 36px;">
              <h1 style="margin: 0 0 10px 0; font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.4px; line-height: 1.3;">
                We've received your project brief.
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 14.5px; line-height: 1.65; color: #475569;">
                Hello <strong>${escapeHtml(name)}</strong>, thank you for connecting with us. We have successfully logged your project specifications. Our team is currently reviewing your brief and will be in touch with next steps.
              </p>

              <!-- Project Scope Dossier Box -->
              <div style="background-color: #fbfcfd; border: 1px solid #e6ecf2; border-radius: 12px; padding: 22px 24px; margin-bottom: 26px;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 14px; border-bottom: 1px solid #edf2f7; padding-bottom: 10px;">
                  <tr>
                    <td valign="middle">
                      <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b;">
                        Project Scope Specification
                      </span>
                    </td>
                    <td align="right" valign="middle">
                      <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; font-weight: 600; color: #2563eb; background-color: #eff6ff; padding: 3px 8px; border-radius: 6px; border: 1px solid #dbeafe;">
                        ${refCode}
                      </span>
                    </td>
                  </tr>
                </table>

                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td class="mobile-spec-label" style="padding: 7px 0; font-size: 13.5px; color: #64748b; width: 150px; vertical-align: top;">Service Discipline:</td>
                    <td class="mobile-spec-val" style="padding: 7px 0; font-size: 14px; font-weight: 600; color: #0f172a; vertical-align: top;">${escapeHtml(serviceName)}</td>
                  </tr>
                  ${body.project_type ? `<tr>
                    <td class="mobile-spec-label" style="padding: 7px 0; font-size: 13.5px; color: #64748b; width: 150px; vertical-align: top;">Deliverable:</td>
                    <td class="mobile-spec-val" style="padding: 7px 0; font-size: 14px; color: #0f172a; vertical-align: top;">${escapeHtml(body.project_type)}</td>
                  </tr>` : ''}
                  <tr>
                    <td class="mobile-spec-label" style="padding: 7px 0; font-size: 13.5px; color: #64748b; width: 150px; vertical-align: top;">Estimated Timeline:</td>
                    <td class="mobile-spec-val" style="padding: 7px 0; font-size: 14px; font-weight: 500; color: #0f172a; vertical-align: top;">${escapeHtml(timeline || 'Flexible')}</td>
                  </tr>
                  <tr>
                    <td class="mobile-spec-label" style="padding: 7px 0; font-size: 13.5px; color: #64748b; width: 150px; vertical-align: top;">Budget Tier:</td>
                    <td class="mobile-spec-val" style="padding: 7px 0; font-size: 14px; font-weight: 500; color: #0f172a; vertical-align: top;">${escapeHtml(budget || 'Discuss')}</td>
                  </tr>
                  ${template_code ? `<tr>
                    <td class="mobile-spec-label" style="padding: 7px 0; font-size: 13.5px; color: #64748b; width: 150px; vertical-align: top;">Template Code:</td>
                    <td class="mobile-spec-val" style="padding: 7px 0; font-size: 13.5px; font-family: ui-monospace, monospace; color: #0f172a; vertical-align: top;">${escapeHtml(template_code)}</td>
                  </tr>` : ''}
                  ${whatsapp ? `<tr>
                    <td class="mobile-spec-label" style="padding: 7px 0; font-size: 13.5px; color: #64748b; width: 150px; vertical-align: top;">WhatsApp Contact:</td>
                    <td class="mobile-spec-val" style="padding: 7px 0; font-size: 14px; color: #0f172a; vertical-align: top;">${escapeHtml(whatsapp)}</td>
                  </tr>` : ''}
                </table>

                ${notes ? `
                <div style="margin-top: 16px; padding: 12px 14px; border-left: 3px solid #2563eb; background-color: #ffffff; border-radius: 0 8px 8px 0; border-top: 1px solid #eef2f6; border-right: 1px solid #eef2f6; border-bottom: 1px solid #eef2f6;">
                  <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">Scope &amp; Requirements:</div>
                  <div style="font-size: 13.5px; line-height: 1.55; color: #334155; white-space: pre-wrap;">${escapeHtml(notes)}</div>
                </div>` : ''}
              </div>

              <!-- Next Steps Roadmap -->
              <div style="background-color: #ffffff; border: 1px solid #eef2f6; border-radius: 12px; padding: 20px 22px; margin-bottom: 26px;">
                <div style="font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #0f172a; margin-bottom: 14px;">
                  What Happens Next
                </div>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td valign="top" style="width: 26px; padding-bottom: 12px;">
                      <span style="display: inline-block; width: 20px; height: 20px; line-height: 20px; text-align: center; border-radius: 50%; background-color: #eff6ff; color: #2563eb; font-size: 11px; font-weight: 700;">1</span>
                    </td>
                    <td valign="top" style="padding-bottom: 12px; font-size: 13.5px; line-height: 1.5; color: #334155;">
                      <strong style="color: #0f172a;">Brief Assessment</strong> — We analyze your requirements, objectives, and deliverables.
                    </td>
                  </tr>
                  <tr>
                    <td valign="top" style="width: 26px; padding-bottom: 12px;">
                      <span style="display: inline-block; width: 20px; height: 20px; line-height: 20px; text-align: center; border-radius: 50%; background-color: #eff6ff; color: #2563eb; font-size: 11px; font-weight: 700;">2</span>
                    </td>
                    <td valign="top" style="padding-bottom: 12px; font-size: 13.5px; line-height: 1.5; color: #334155;">
                      <strong style="color: #0f172a;">Scope &amp; Proposal</strong> — We prepare our recommended approach, timeline, and quote.
                    </td>
                  </tr>
                  <tr>
                    <td valign="top" style="width: 26px;">
                      <span style="display: inline-block; width: 20px; height: 20px; line-height: 20px; text-align: center; border-radius: 50%; background-color: #eff6ff; color: #2563eb; font-size: 11px; font-weight: 700;">3</span>
                    </td>
                    <td valign="top" style="font-size: 13.5px; line-height: 1.5; color: #334155;">
                      <strong style="color: #0f172a;">Direct Follow-up</strong> — We'll reach out directly via email or WhatsApp to schedule a discussion.
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Quick Concierge Action Card -->
              <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 18px 20px; text-align: center;">
                <p style="margin: 0 0 12px 0; font-size: 13.5px; color: #334155;">
                  Have updates, references, or need a quick question answered?
                </p>
                <div>
                  <a href="https://wa.me/919366440834?text=Hi%20Dexter%2C%20following%20up%20on%20my%20brief%20${refCode}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 9px 18px; border-radius: 100px; font-size: 13px; font-weight: 600; margin: 4px;">
                    Chat on WhatsApp
                  </a>
                  <a href="mailto:dextercr.app@gmail.com?subject=Regarding%20Brief%20${refCode}" style="display: inline-block; background-color: #ffffff; color: #0f172a; border: 1px solid #cbd5e1; text-decoration: none; padding: 9px 18px; border-radius: 100px; font-size: 13px; font-weight: 600; margin: 4px;">
                    Email Us
                  </a>
                </div>
              </div>

            </td>
          </tr>

          <!-- Anti-Spam Compliant Footer (Signed by 'Our Team', NO physical address) -->
          <tr>
            <td class="mobile-padding" style="padding: 24px 36px 30px 36px; background-color: #fbfcfd; border-top: 1px solid #eef2f6; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 13.5px; font-weight: 700; color: #334155; letter-spacing: -0.2px;">
                Our Team
              </p>
              <p style="margin: 0 0 10px 0; font-size: 12px; line-height: 1.6; color: #94a3b8; max-width: 480px; margin-left: auto; margin-right: auto;">
                You received this automated receipt because you submitted a project inquiry on our website.<br>
                For any inquiries or revisions, reach out directly at <a href="mailto:dextercr.app@gmail.com" style="color: #2563eb; text-decoration: underline;">dextercr.app@gmail.com</a>.
              </p>
              <div style="font-size: 12px; color: #64748b; padding-top: 4px;">
                <span>WhatsApp: <a href="https://wa.me/919366440834" style="color: #10b981; text-decoration: none; font-weight: 500;">+91 9366440834</a></span>
                <span style="margin: 0 8px; color: #cbd5e1;">•</span>
                <span>Web: <a href="https://dextercr.vercel.app" style="color: #2563eb; text-decoration: none;">dextercr.vercel.app</a></span>
              </div>
            </td>
          </tr>

        </table>
        <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

      const clientText = `Project Brief Received [${refCode}]

Hello ${name},

Thank you for connecting with us. We have successfully logged your project specifications. Our team is currently reviewing your brief and will be in touch with next steps.

Project Scope Specification:
• Reference Code: ${refCode}
• Service Discipline: ${serviceName}
${body.project_type ? `• Deliverable: ${body.project_type}\n` : ''}• Estimated Timeline: ${timeline || 'Flexible'}
• Budget Tier: ${budget || 'Discuss'}
${template_code ? `• Template Code: ${template_code}\n` : ''}${whatsapp ? `• WhatsApp Contact: ${whatsapp}\n` : ''}${notes ? `• Scope & Requirements: ${notes}\n` : ''}
What Happens Next:
1. Brief Assessment — We analyze your requirements, objectives, and deliverables.
2. Scope & Proposal — We prepare our recommended approach, timeline, and quote.
3. Direct Follow-up — We'll reach out directly via email or WhatsApp to schedule a discussion.

Have questions or updates? Reach out:
WhatsApp: +91 9366440834
Email: dextercr.app@gmail.com
Web: dextercr.vercel.app

— Our Team

---
You received this automated receipt because you submitted a project inquiry on our website.
If you have any questions, reach out to us at dextercr.app@gmail.com`;

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
