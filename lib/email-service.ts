// Email Service for Santa Letter Replies

import validator from 'validator';
import { escapeHtml } from './input-sanitization';
import { debugLog } from './logging';
import { hashEmail, safeErrorSummary } from './privacy-utils';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface SantaEmailParams {
  parentEmail: string;
  childName: string;
  santaReply: string;
}

/**
 * Get email configuration from environment variables
 */
function getEmailConfig(): EmailConfig {
  return {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  };
}

function isRetryableError(err: any) {
  const retryableCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNRESET', 'ENOTFOUND'];
  if (!err) return false;
  // nodemailer adds `code` to underlying errors
  if (err.code && retryableCodes.includes(err.code)) return true;
  // Some SMTP errors use responseCode for 4xx (temporary)
  if (err.responseCode && typeof err.responseCode === 'number' && err.responseCode >= 400 && err.responseCode < 500) return true;
  // Fallback: treat network errors as retryable by looking for common phrases
  if (typeof err.message === 'string' && (err.message.includes('ETIMEDOUT') || err.message.includes('Connection timed out') || err.message.includes('ECONNRESET') || err.message.includes('connect EHOSTUNREACH'))) return true;
  return false;
}

export async function sendMailWithRetries(config: any, mailOptions: any, opts: { attempts?: number; initialDelayMs?: number; factor?: number; verify?: boolean; createTransport?: () => any; } = {}) {
  const attempts = opts.attempts ?? 3;
  const initialDelayMs = opts.initialDelayMs ?? 1000;
  const factor = opts.factor ?? 2;
  const doVerify = opts.verify !== undefined ? opts.verify : true;
  const createTransport = opts.createTransport;

  let attempt = 0;
  let lastError: any = null;
  while (attempt < attempts) {
    attempt += 1;
    try {
      const nodemailer = await import('nodemailer');
      const transporter = (createTransport && createTransport()) || nodemailer.default.createTransport(config);
      debugLog(`[email] Attempt ${attempt} - sending email to ${hashEmail(String(mailOptions.to))}`);
      if (doVerify) await transporter.verify();
      const info = await transporter.sendMail(mailOptions);
      debugLog(`[email] Sent on attempt ${attempt} - info: ${info && info.messageId}`);
      return info;
    } catch (err: any) {
      lastError = err;
      if (isRetryableError(err) && attempt < attempts) {
        const delayMs = Math.floor(initialDelayMs * Math.pow(factor, attempt - 1) + Math.random() * 200);
        debugLog(`[email] Temporary error (attempt ${attempt}): ${err.code || err.message}. Retrying in ${delayMs}ms`);
        await new Promise(res => setTimeout(res, delayMs));
        continue;
      }
      debugLog(`[email] Permanent error or no more retries: ${err.code || err.message}`);
      throw err;
    }
  }
  throw lastError;
}

/**
 * Create festive HTML email template for Santa's reply
 * ✅ SECURITY: Escapes all dynamic content to prevent XSS
 */
function createSantaEmailHTML(childName: string, santaReply: string): string {
  // ✅ SECURITY: Escape HTML in dynamic content
  const safeName = escapeHtml(childName);
  const safeReply = escapeHtml(santaReply).replace(/\n/g, '<br>');
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; style-src 'unsafe-inline';">
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Georgia', 'Times New Roman', serif;
      background: linear-gradient(to bottom, #1a472a 0%, #2d5a3d 100%);
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 15px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      border: 5px solid #c41e3a;
    }
    .header {
      background: linear-gradient(135deg, #c41e3a 0%, #8b1428 100%);
      padding: 30px;
      text-align: center;
      border-bottom: 3px solid gold;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 36px;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
      font-family: 'Brush Script MT', cursive;
    }
    .north-pole {
      color: #ffd700;
      font-size: 14px;
      margin-top: 5px;
      font-style: italic;
    }
    .snowflake {
      display: inline-block;
      font-size: 24px;
      margin: 0 10px;
    }
    .content {
      padding: 40px;
      background: linear-gradient(to bottom, #ffffff 0%, #f9f9f9 100%);
    }
    .letter {
      background: #ffffff;
      padding: 30px;
      border-left: 4px solid #c41e3a;
      border-radius: 8px;
      line-height: 1.8;
      font-size: 16px;
      color: #333333;
      white-space: pre-wrap;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
    }
    .footer {
      background: linear-gradient(135deg, #1a472a 0%, #2d5a3d 100%);
      padding: 20px;
      text-align: center;
      color: #ffffff;
      font-size: 12px;
    }
    .divider {
      height: 3px;
      background: linear-gradient(to right, #c41e3a, gold, #2d5a3d);
      margin: 20px 0;
    }
    .ornament {
      display: inline-block;
      width: 12px;
      height: 12px;
      background: #c41e3a;
      border-radius: 50%;
      margin: 0 5px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="snowflake">❄️</span>
      <h1>🎅 Letter from Santa 🎅</h1>
      <span class="snowflake">❄️</span>
      <p class="north-pole">The North Pole Workshop</p>
    </div>
    
    <div class="content">
      <p style="text-align: center; color: #c41e3a; font-size: 18px; margin-bottom: 20px;">
        <strong>Special Delivery for ${safeName}'s Family! 🎄</strong>
      </p>
      
      <div class="divider"></div>
      
      <div class="letter">${safeReply}</div>
      
      <div class="divider"></div>
      
      <p style="text-align: center; color: #666; font-size: 14px; margin-top: 30px;">
        <span class="ornament"></span>
        <span class="ornament" style="background: gold;"></span>
        <span class="ornament" style="background: #2d5a3d;"></span>
        <br><br>
        🎁 Keep the magic alive! 🎁
      </p>
    </div>
    
    <div class="footer">
      <p>This letter was magically delivered from Santa's Workshop at the North Pole 🎅</p>
      <p style="margin-top: 10px; font-size: 10px; opacity: 0.8;">
        Ho Ho Ho! Merry Christmas! 🎄✨
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Sanitize email header values to prevent injection attacks
 * SECURITY: Removes newlines, angle brackets, and URL encoding characters
 * 
 * @param input - Raw header value
 * @returns Sanitized header value safe for email headers
 */
function sanitizeEmailHeader(input: string): string {
  return input
    .replace(/[\r\n]/g, '') // Remove newlines (header injection)
    .replace(/[<>]/g, '')    // Remove angle brackets (email injection)
    .replace(/%/g, '')        // Remove URL encoding chars
    .replace(/\\/g, '')       // Remove backslashes
    .trim()
    .substring(0, 200);       // Limit length
}

/**
 * Send Santa's reply email to parent
 * ✅ SECURITY: Validates and sanitizes all email inputs
 */
export async function sendSantaReply(params: SantaEmailParams): Promise<boolean> {
  try {
    console.log('📧 Email service: Starting to send email to', hashEmail(params.parentEmail));
    
    // SECURITY: Sanitize all email header inputs
    const sanitizedEmail = sanitizeEmailHeader(params.parentEmail);
    const sanitizedChildName = sanitizeEmailHeader(params.childName);
    
    // ✅ SECURITY: Validate email address after sanitization
    if (!validator.isEmail(sanitizedEmail)) {
      console.error('❌ Invalid email address:', hashEmail(params.parentEmail));
      throw new Error('Invalid email address');
    }
    
    // ✅ SECURITY: Additional validation - no suspicious patterns
    if (/[<>{}[\]\\]/.test(sanitizedEmail)) {
      console.error('❌ Email contains invalid characters');
      throw new Error('Email contains invalid characters');
    }
    
    // Dynamic import of nodemailer to avoid bundling issues
    const nodemailer = await import('nodemailer');

    const config = getEmailConfig();
    console.log('📧 SMTP Config:', { host: config.host, port: config.port, user: config.auth.user });
    
    // Validate configuration
    if (!config.auth.user || !config.auth.pass) {
      console.error('❌ Email configuration missing: SMTP_USER and SMTP_PASS required');
      return false;
    }

    const mailOptions = {
      from: `"Santa Claus 🎅" <${config.auth.user}>`,
      to: sanitizedEmail, // Use sanitized email
      subject: `🎄 A Special Letter from Santa for ${sanitizedChildName}! 🎅`, // Use sanitized name
      text: params.santaReply, // Plain text fallback
      html: createSantaEmailHTML(sanitizedChildName, params.santaReply), // Use sanitized name
    };

    try {
      await sendMailWithRetries(config, mailOptions, {
        attempts: parseInt(process.env.SMTP_RETRY_ATTEMPTS || '3', 10),
        initialDelayMs: parseInt(process.env.SMTP_RETRY_INITIAL_MS || '1000', 10),
        factor: 2,
        verify: true,
        createTransport: () => nodemailer.default.createTransport(config),
      });
      debugLog('✅ Santa email sent');
      return true;
    } catch (err) {
      console.error('❌ Error sending Santa email after retries:', safeErrorSummary(err));
      return false;
    }
  } catch (error) {
    console.error('❌ Error sending Santa email:', safeErrorSummary(error));
    return false;
  }
}

/**
 * Email asking the parent to confirm a letter to Santa.
 * ✅ SECURITY: fixed wording only — nothing the letter's sender typed (child name, letter text)
 * goes into it, so the public form cannot deliver someone else's words to a stranger.
 */
export function createConfirmationEmail(siteName: string, confirmUrl: string) {
  const name = siteName.replace(/[\r\n]/g, ' ').trim() || 'our light show';
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(confirmUrl);

  const subject = `Please confirm your letter to Santa - ${name}`;
  const text = [
    `Someone used this email address to write a letter to Santa on the ${name} website.`,
    '',
    'If that was you, open this link within 3 days and press the button to send the letter on to Santa. His reply will come to this address:',
    confirmUrl,
    '',
    "If it wasn't you, just ignore this email. Nothing else will be sent to you.",
  ].join('\n');
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
</head>
<body style="margin:0;padding:24px;background:#1a472a;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:4px solid #c41e3a;padding:32px;color:#333333;line-height:1.6;">
    <h1 style="margin:0 0 16px;color:#c41e3a;font-size:26px;text-align:center;">🎅 Confirm your letter to Santa</h1>
    <p>Someone used this email address to write a letter to Santa on the <strong>${safeName}</strong> website.</p>
    <p>If that was you, press the button within 3 days to send the letter on to Santa. His reply will come to this address.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${safeUrl}" style="display:inline-block;background:#c41e3a;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:999px;">Confirm my letter</a>
    </p>
    <p style="font-size:13px;color:#666666;">Button not working? Copy this link into your browser:<br>${safeUrl}</p>
    <p style="font-size:13px;color:#666666;">If it wasn't you, just ignore this email. Nothing else will be sent to you.</p>
  </div>
</body>
</html>
  `;
  return { subject, text, html };
}

/**
 * Send the confirmation email for a new Santa letter
 */
export async function sendSantaConfirmation(params: { parentEmail: string; confirmUrl: string; siteName: string }): Promise<boolean> {
  try {
    const sanitizedEmail = sanitizeEmailHeader(params.parentEmail);
    if (!validator.isEmail(sanitizedEmail)) {
      throw new Error('Invalid email address');
    }

    const nodemailer = await import('nodemailer');
    const config = getEmailConfig();
    if (!config.auth.user || !config.auth.pass) {
      console.error('❌ Email configuration missing: SMTP_USER and SMTP_PASS required');
      return false;
    }

    const { subject, text, html } = createConfirmationEmail(params.siteName, params.confirmUrl);
    await sendMailWithRetries(config, {
      from: `"Santa Claus 🎅" <${config.auth.user}>`,
      to: sanitizedEmail,
      subject,
      text,
      html,
    }, {
      attempts: parseInt(process.env.SMTP_RETRY_ATTEMPTS || '3', 10),
      initialDelayMs: parseInt(process.env.SMTP_RETRY_INITIAL_MS || '1000', 10),
      factor: 2,
      verify: true,
      createTransport: () => nodemailer.default.createTransport(config),
    });
    debugLog('✅ Santa confirmation email sent');
    return true;
  } catch (error) {
    console.error('❌ Error sending Santa confirmation email:', safeErrorSummary(error));
    return false;
  }
}

/**
 * Test email configuration
 */
export async function testEmailConnection(): Promise<boolean> {
  try {
    const nodemailer = await import('nodemailer');
    const config = getEmailConfig();
    
    if (!config.auth.user || !config.auth.pass) {
      return false;
    }

    const transporter = nodemailer.default.createTransport(config);
    await transporter.verify();
    return true;
  } catch (error) {
    console.error('Email connection test failed:', error);
    return false;
  }
}

/**
 * Send device offline alert email
 */
export async function sendAlertEmail(deviceName: string, deviceIp: string): Promise<boolean> {
  try {
    console.log(`📧 Sending device alert email for ${deviceName} (${deviceIp})`);
    
    const nodemailer = await import('nodemailer');
    const config = getEmailConfig();
    
    // Validate configuration
    if (!config.auth.user || !config.auth.pass) {
      console.error('❌ Email configuration missing: SMTP_USER and SMTP_PASS required');
      return false;
    }

    // We will use the sendMailWithRetries helper which will create the transporter and handle verify/retries
    
    // Escape HTML in device name and IP
    const safeName = escapeHtml(deviceName);
    const safeIp = escapeHtml(deviceIp);
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
      border-left: 5px solid #dc3545;
    }
    .header {
      background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
      padding: 30px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 30px;
    }
    .alert-box {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 5px;
      padding: 20px;
      margin: 20px 0;
    }
    .device-info {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 5px;
      margin: 15px 0;
      font-family: 'Courier New', monospace;
    }
    .device-info strong {
      color: #dc3545;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px;
      text-align: center;
      color: #6c757d;
      font-size: 12px;
    }
    .status-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="status-icon">⚠️</div>
      <h1>Device Offline Alert</h1>
    </div>
    
    <div class="content">
      <div class="alert-box">
        <strong>⚠️ DEVICE OFFLINE</strong>
        <p>A monitored device has failed its health check and is currently offline.</p>
      </div>
      
      <div class="device-info">
        <strong>Device Name:</strong> ${safeName}<br>
        <strong>IP Address:</strong> ${safeIp}<br>
        <strong>Time:</strong> ${new Date().toLocaleString()}<br>
        <strong>Status:</strong> <span style="color: #dc3545;">❌ OFFLINE</span>
      </div>
      
      <p style="color: #666; line-height: 1.6;">
        The device monitoring system has detected that <strong>${safeName}</strong> is not responding to ping requests.
        Please check the device and network connection.
      </p>
      
      <p style="color: #666; font-size: 14px; margin-top: 20px;">
        <strong>Troubleshooting Steps:</strong>
      </p>
      <ul style="color: #666; line-height: 1.8;">
        <li>Verify the device is powered on</li>
        <li>Check network cable connections</li>
        <li>Verify the device IP address is correct (${safeIp})</li>
        <li>Check your network switch/router</li>
        <li>Try accessing the device directly via web browser</li>
      </ul>
      
      <p style="color: #999; font-size: 12px; margin-top: 30px; font-style: italic;">
        Note: You will receive another alert if the device remains offline for more than 1 hour.
      </p>
    </div>
    
    <div class="footer">
      <p>FPP Website Device Monitoring System</p>
      <p>This is an automated alert from your device health monitoring service.</p>
    </div>
  </div>
</body>
</html>
    `;

    const mailOptions = {
      from: `"Device Monitor" <${config.auth.user}>`,
      to: config.auth.user, // Send to admin (same as SMTP_USER)
      subject: `⚠️ Device Offline: ${deviceName} (${deviceIp})`,
      text: `DEVICE OFFLINE ALERT\n\nDevice Name: ${deviceName}\nIP Address: ${deviceIp}\nTime: ${new Date().toLocaleString()}\n\nThe device is not responding to ping requests. Please check the device and network connection.`,
      html: htmlContent,
    };

    const info = await sendMailWithRetries(config, mailOptions, {
      attempts: parseInt(process.env.SMTP_RETRY_ATTEMPTS || '3', 10),
      initialDelayMs: parseInt(process.env.SMTP_RETRY_INITIAL_MS || '1000', 10),
      factor: 2,
      verify: true,
      createTransport: () => nodemailer.default.createTransport(config),
    });

    debugLog('✅ Device alert email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending device alert email:', error);
    return false;
  }
}
