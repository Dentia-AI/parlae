export interface ClinicBookingNotificationData {
  clinicName: string;
  patientName: string;
  patientPhone?: string;
  appointmentType: string;
  date: string;
  time: string;
  duration: string;
  notes?: string;
  providerPreference?: string;
  bookingSource: 'google_calendar' | 'pms_failure';
  pmsErrorMessage?: string;
  gcalBackupCreated?: boolean;
  gcalEventLink?: string;
  // Branding
  logoUrl?: string;
  primaryColor?: string;
  businessName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  website?: string;
}

const HIPAA_DISCLAIMER = `
<p style="margin: 0; font-size: 11px; color: #9ca3af; line-height: 1.5;">
  <strong>CONFIDENTIALITY NOTICE:</strong> This email and any attachments are for the
  exclusive and confidential use of the intended recipient. If you are not the intended
  recipient, please do not read, distribute, or take action based on this message.
  This communication may contain Protected Health Information (PHI) subject to HIPAA
  regulations. Any unauthorized review, use, disclosure, or distribution is prohibited.
  If you received this in error, please notify the sender immediately and delete all copies.
</p>
`;

export function renderClinicBookingNotification(
  data: ClinicBookingNotificationData,
): { html: string; subject: string } {
  const primaryColor = data.primaryColor || '#3b82f6';
  const clinicName = data.businessName || data.clinicName;
  const isPmsFailure = data.bookingSource === 'pms_failure';

  const headerBgColor = isPmsFailure ? '#dc2626' : '#059669';
  const headerTitle = isPmsFailure
    ? 'Action Required: Manual Booking Needed'
    : 'New Appointment Booked';
  const headerSubtitle = isPmsFailure
    ? 'The PMS system could not process this booking automatically.'
    : 'A new appointment was booked via your AI Receptionist.';

  const subject = isPmsFailure
    ? `URGENT: Manual booking needed — ${data.appointmentType} for ${data.patientName}`
    : `New Appointment: ${data.appointmentType} for ${data.patientName} on ${data.date}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headerTitle}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

          <!-- Header -->
          <tr>
            <td style="background-color: ${headerBgColor}; padding: 32px 40px; text-align: center;">
              ${data.logoUrl ? `<img src="${data.logoUrl}" alt="${clinicName}" style="max-width: 120px; height: auto; margin-bottom: 16px;">` : ''}
              <h1 style="margin: 0 0 8px; color: #ffffff; font-size: 24px; font-weight: 600;">${headerTitle}</h1>
              <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 14px;">${headerSubtitle}</p>
            </td>
          </tr>

          ${isPmsFailure ? `
          <!-- PMS Error Alert -->
          <tr>
            <td style="padding: 20px 40px 0;">
              <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px;">
                <p style="margin: 0 0 8px; font-size: 14px; color: #991b1b; font-weight: 600;">PMS Writeback Failed</p>
                <p style="margin: 0; font-size: 13px; color: #b91c1c; line-height: 1.5;">
                  ${data.pmsErrorMessage || 'The appointment could not be written to your practice management system.'}
                  ${data.gcalBackupCreated ? ' A backup event has been created in Google Calendar.' : ''}
                </p>
                <p style="margin: 8px 0 0; font-size: 13px; color: #991b1b; font-weight: 600;">
                  Please manually enter this appointment into your PMS system.
                </p>
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- Patient Details -->
          <tr>
            <td style="padding: 24px 40px 0;">
              <h2 style="margin: 0 0 16px; font-size: 16px; color: #374151; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Patient Information</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 12px; color: #6b7280; font-weight: 500; text-transform: uppercase;">Name</p>
                    <p style="margin: 4px 0 0; font-size: 16px; color: #111827; font-weight: 600;">${data.patientName}</p>
                  </td>
                </tr>
                ${data.patientPhone ? `
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0; font-size: 12px; color: #6b7280; font-weight: 500; text-transform: uppercase;">Phone</p>
                    <p style="margin: 4px 0 0; font-size: 16px; color: #111827; font-weight: 600;">${data.patientPhone}</p>
                  </td>
                </tr>
                ` : ''}
              </table>
            </td>
          </tr>

          <!-- Appointment Details -->
          <tr>
            <td style="padding: 24px 40px 0;">
              <h2 style="margin: 0 0 16px; font-size: 16px; color: #374151; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Appointment Details</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 12px; color: #6b7280; font-weight: 500; text-transform: uppercase;">Type</p>
                    <p style="margin: 4px 0 0; font-size: 16px; color: #111827; font-weight: 600;">${data.appointmentType}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 12px; color: #6b7280; font-weight: 500; text-transform: uppercase;">Date &amp; Time</p>
                    <p style="margin: 4px 0 0; font-size: 16px; color: #111827; font-weight: 600;">${data.date} at ${data.time}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0; font-size: 12px; color: #6b7280; font-weight: 500; text-transform: uppercase;">Duration</p>
                    <p style="margin: 4px 0 0; font-size: 16px; color: #111827; font-weight: 600;">${data.duration}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${data.notes ? `
          <!-- Notes from Call -->
          <tr>
            <td style="padding: 20px 40px 0;">
              <div style="background-color: #eff6ff; border-left: 4px solid ${primaryColor}; padding: 16px; border-radius: 4px;">
                <p style="margin: 0 0 8px; font-size: 13px; color: #1e40af; font-weight: 600;">Notes from AI Call:</p>
                <p style="margin: 0; font-size: 13px; color: #1e3a8a; line-height: 1.6;">${data.notes}</p>
              </div>
            </td>
          </tr>
          ` : ''}

          ${data.gcalEventLink ? `
          <!-- Google Calendar Link -->
          <tr>
            <td style="padding: 20px 40px 0; text-align: center;">
              <a href="${data.gcalEventLink}" style="display: inline-block; background-color: ${primaryColor}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">View in Google Calendar</a>
            </td>
          </tr>
          ` : ''}

          <!-- Booking Source -->
          <tr>
            <td style="padding: 24px 40px;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                Booked via ${clinicName}'s AI Receptionist
                ${isPmsFailure ? ' | PMS backup required' : ' | Google Calendar'}
              </p>
            </td>
          </tr>

          <!-- HIPAA Disclaimer -->
          <tr>
            <td style="padding: 16px 40px 24px; border-top: 1px solid #e5e7eb;">
              ${HIPAA_DISCLAIMER}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return { html, subject };
}
