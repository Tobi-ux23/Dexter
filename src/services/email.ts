/**
 * Client-Side Email & OTP Dispatch Utility
 *
 * Strictly calls the serverless endpoint at /api/send-email using standard browser fetch.
 * No nodemailer packages or server credentials exist in the client bundle.
 */

export interface SendEmailOptions {
  to?: string;
  subject?: string;
  html?: string;
  text?: string;
  message?: string;
  action?: 'send-otp' | 'verify-otp' | 'intake' | 'send-email';
  email?: string;
  code?: string;
  purpose?: string;
  [key: string]: any;
}

export interface SendEmailResponse {
  success: boolean;
  message?: string;
  messageId?: string;
  expiresInSeconds?: number;
  verifiedEmail?: string;
  referenceCode?: string;
  error?: string;
}

/**
 * Dispatches an email or invokes an email/OTP action via the /api/send-email serverless endpoint.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResponse> {
  const response = await fetch('/api/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(options),
  });

  const data: SendEmailResponse = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to dispatch email');
  }
  return data;
}

/**
 * Requests a 6-digit verification code to be generated and dispatched to the given email.
 */
export async function requestOtp(email: string, purpose: string = 'Verification'): Promise<SendEmailResponse> {
  return sendEmail({
    action: 'send-otp',
    email,
    purpose,
  });
}

/**
 * Verifies a 6-digit verification code for the given email.
 */
export async function verifyOtp(email: string, code: string): Promise<SendEmailResponse> {
  return sendEmail({
    action: 'verify-otp',
    email,
    code,
  });
}
