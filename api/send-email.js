import nodemailer from 'nodemailer';

// Server-side environment variables for Gmail SMTP
const EMAIL_USER = process.env.EMAIL_USER || 'dextercr.app@gmail.com';
const EMAIL_PASS = (process.env.EMAIL_PASS || 'bcth nlmx mkkq vqsc').replace(/\s+/g, '');
const APP_NAME = process.env.APP_NAME || 'Dexter';

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
          <tr>
            <td style="padding: 32px 32px 20px 32px; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: center;">
              <div style="font-size: 24px; font-weight: 700; color: #ffffff;">
                <span style="color: #4285f4;">${APP_NAME.toUpperCase()}</span>
              </div>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: rgba(232,234,242,0.5); text-transform: uppercase; letter-spacing: 1.5px;">Security & Verification</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px 24px 32px; text-align: center;">
              <h1 style="margin: 0 0 12px 0; font-size: 21px; font-weight: 600; color: #ffffff;">Verification Code</h1>
              <p style="margin: 0 0 28px 0; font-size: 14.5px; line-height: 1.6; color: rgba(232,234,242,0.75);">
                Use the one-time code below for your <strong style="color: #fff;">${escapeHtml(formattedPurpose)}</strong> with ${APP_NAME}.
              </p>
              <div style="background: rgba(255,255,255,0.03); border: 1.5px dashed rgba(66, 133, 244, 0.4); border-radius: 12px; padding: 22px 16px; margin: 0 auto 28px auto; max-width: 340px;">
                <div style="font-size: 38px; font-weight: 700; letter-spacing: 10px; color: #4285f4; font-family: 'Courier New', Courier, monospace;">
                  ${otpCode}
                </div>
                <div style="margin-top: 10px; font-size: 12px; color: rgba(232,234,242,0.5); font-weight: 500;">
                  ⏱ Valid for <span style="color: #fbbc04;">5 minutes</span> only
                </div>
              </div>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: rgba(232,234,242,0.5);">
                Do not share this code with anyone. If you did not initiate this request, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.06); text-align: center;">
              <p style="margin: 0; font-size: 12px; color: rgba(232,234,242,0.4); line-height: 1.5;">
                Sent securely by ${APP_NAME} Automated Dispatch<br>
                ${EMAIL_USER}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      const textContent = `${APP_NAME} Verification Code\n\nYour 6-digit one-time verification code is: ${otpCode}\n\nThis code is valid for 5 minutes.\nIf you did not request this verification, please disregard this email.\n\n— ${APP_NAME}\n${EMAIL_USER}`;

      const info = await transporter.sendMail({
        from: `"${APP_NAME}" <${EMAIL_USER}>`,
        to: email,
        subject: `[${APP_NAME}] Your Verification Code is ${otpCode}`,
        text: textContent,
        html: htmlContent,
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
            <div style="font-size: 24px; font-weight: 700; color: #4285f4;">${APP_NAME.toUpperCase()}</div>
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
      subject,
      text,
      html,
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
