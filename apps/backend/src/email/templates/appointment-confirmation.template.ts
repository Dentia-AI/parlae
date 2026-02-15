export interface AppointmentConfirmationData {
  patientName: string;
  clinicName: string;
  appointmentType: string;
  date: string;
  time: string;
  duration: string;
  location?: string;
  notes?: string;
  // Branding
  logoUrl?: string;
  primaryColor?: string;
  businessName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  website?: string;
}

export function renderAppointmentConfirmation(data: AppointmentConfirmationData): { html: string; subject: string } {
  const primaryColor = data.primaryColor || '#3b82f6';
  const clinicName = data.businessName || data.clinicName;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header with Logo -->
          <tr>
            <td style="background-color: ${primaryColor}; padding: 40px 40px 30px; text-align: center;">
              ${data.logoUrl ? `<img src="${data.logoUrl}" alt="${clinicName}" style="max-width: 150px; height: auto; margin-bottom: 20px;">` : ''}
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Appointment Confirmed</h1>
            </td>
          </tr>

          <!-- Success Icon -->
          <tr>
            <td style="padding: 30px 40px 20px; text-align: center;">
              <div style="width: 64px; height: 64px; background-color: #10b981; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                <span style="color: white; font-size: 32px;">✓</span>
              </div>
              <p style="margin: 0; font-size: 18px; color: #374151; line-height: 1.6;">
                Hi <strong>${data.patientName}</strong>,<br>
                Your appointment has been confirmed!
              </p>
            </td>
          </tr>

          <!-- Appointment Details -->
          <tr>
            <td style="padding: 20px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; padding: 24px;">
                <tr>
                  <td style="padding-bottom: 16px;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Appointment Type</p>
                    <p style="margin: 4px 0 0; font-size: 18px; color: #111827; font-weight: 600;">${data.appointmentType}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 16px;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Date & Time</p>
                    <p style="margin: 4px 0 0; font-size: 18px; color: #111827; font-weight: 600;">${data.date} at ${data.time}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 16px;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Duration</p>
                    <p style="margin: 4px 0 0; font-size: 18px; color: #111827; font-weight: 600;">${data.duration}</p>
                  </td>
                </tr>
                ${data.location ? `
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 14px; color: #6b7280; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Location</p>
                    <p style="margin: 4px 0 0; font-size: 16px; color: #111827;">${data.location}</p>
                  </td>
                </tr>
                ` : ''}
              </table>
            </td>
          </tr>

          ${data.notes ? `
          <!-- Notes -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="background-color: #eff6ff; border-left: 4px solid ${primaryColor}; padding: 16px; border-radius: 4px;">
                <p style="margin: 0 0 8px; font-size: 14px; color: #1e40af; font-weight: 600;">Notes:</p>
                <p style="margin: 0; font-size: 14px; color: #1e3a8a; line-height: 1.6;">${data.notes}</p>
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- CTA Button -->
          <tr>
            <td style="padding: 20px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${data.website || '#'}" style="display: inline-block; background-color: ${primaryColor}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">View Appointment Details</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Reminder -->
          <tr>
            <td style="padding: 20px 40px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 12px; font-size: 14px; color: #6b7280; line-height: 1.6;">
                <strong>Please arrive 10 minutes early</strong> to complete any necessary paperwork.
              </p>
              <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                Need to cancel or reschedule? Please contact us at least 24 hours in advance.
              </p>
            </td>
          </tr>

          <!-- Contact Info -->
          <tr>
            <td style="padding: 20px 40px 40px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">
                <strong style="color: #111827;">Questions?</strong> Contact us:
              </p>
              ${data.contactPhone ? `<p style="margin: 4px 0; font-size: 14px; color: #6b7280;">📞 ${data.contactPhone}</p>` : ''}
              ${data.contactEmail ? `<p style="margin: 4px 0; font-size: 14px; color: #6b7280;">✉️ ${data.contactEmail}</p>` : ''}
              ${data.address ? `<p style="margin: 4px 0; font-size: 14px; color: #6b7280;">📍 ${data.address}</p>` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">
                This appointment was booked via ${clinicName}'s AI Receptionist
              </p>
              ${data.website ? `<p style="margin: 0; font-size: 14px;"><a href="${data.website}" style="color: ${primaryColor}; text-decoration: none;">${data.website}</a></p>` : ''}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return {
    html,
    subject: `Appointment Confirmed: ${data.appointmentType} on ${data.date}`,
  };
}
