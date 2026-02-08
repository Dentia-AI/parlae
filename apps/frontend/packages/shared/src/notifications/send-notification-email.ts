import { prisma } from '@kit/prisma';
import type { Notification } from '@prisma/client';

/**
 * Sends a notification email to the account owner
 * 
 * To use this, you'll need to:
 * 1. Import your mailer: import { getMailer } from '@kit/mailers';
 * 2. Create an email template for notifications
 * 3. Uncomment and customize the implementation below
 */
export async function sendNotificationEmail(notification: Notification) {
  // Get account email
  const account = await prisma.account.findUnique({
    where: { id: notification.accountId },
    select: { email: true, name: true },
  });

  if (!account?.email) {
    console.warn('No email found for account:', notification.accountId);
    return;
  }

  // TODO: Implement email sending with your mailer
  // Example implementation:
  
  /*
  const mailer = await getMailer();
  
  const subject = {
    INFO: 'Notification',
    WARNING: 'Important Notice',
    ERROR: 'Action Required',
  }[notification.type];

  await mailer.sendEmail({
    to: account.email,
    subject: `${subject}: ${notification.body.substring(0, 50)}...`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .notification { 
              padding: 20px; 
              border-radius: 8px; 
              border-left: 4px solid #3b82f6; 
            }
            .notification.warning { border-left-color: #f59e0b; }
            .notification.error { border-left-color: #ef4444; }
            .button { 
              display: inline-block; 
              padding: 12px 24px; 
              background: #3b82f6; 
              color: white; 
              text-decoration: none; 
              border-radius: 6px; 
              margin-top: 16px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Hello ${account.name},</h2>
            <div class="notification ${notification.type.toLowerCase()}">
              <p>${notification.body}</p>
            </div>
            ${notification.link ? `
              <a href="${notification.link}" class="button">View Details</a>
            ` : ''}
            <p style="margin-top: 32px; font-size: 14px; color: #666;">
              This is an automated notification from your account.
            </p>
          </div>
        </body>
      </html>
    `,
  });
  */

  console.log('Email notification would be sent to:', account.email);
}

