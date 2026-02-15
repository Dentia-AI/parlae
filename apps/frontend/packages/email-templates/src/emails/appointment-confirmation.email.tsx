import {
  Body,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
  render,
} from '@react-email/components';

interface BrandingProps {
  logoUrl?: string;
  businessName?: string;
  primaryColor?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  website?: string;
}

interface Props {
  patientName: string;
  clinicName: string;
  appointmentType: string;
  appointmentDate: string;
  appointmentTime: string;
  duration: number;
  notes?: string;
  eventLink?: string;
  branding?: BrandingProps;
}

export async function renderAppointmentConfirmationEmail(props: Props) {
  const businessName = props.branding?.businessName || props.clinicName;
  const subject = `Appointment Confirmed - ${businessName}`;
  const previewText = `Your ${props.appointmentType} appointment is confirmed for ${props.appointmentDate}`;
  const primaryColor = props.branding?.primaryColor || '#3b82f6';

  const html = render(
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header with Logo */}
          <Section style={header}>
            {props.branding?.logoUrl ? (
              <Img
                src={props.branding.logoUrl}
                alt={businessName}
                style={logo}
              />
            ) : (
              <Text style={logoText}>{businessName}</Text>
            )}
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Text style={heading}>Appointment Confirmed ✓</Text>
            
            <Text style={paragraph}>
              Hi {props.patientName},
            </Text>
            
            <Text style={paragraph}>
              Your appointment has been successfully scheduled! We look forward to seeing you.
            </Text>

            {/* Appointment Details Card */}
            <Section style={detailsCard}>
              <Text style={detailsHeading}>📅 Appointment Details</Text>
              
              <Row style={detailRow}>
                <Column><Text style={detailLabel}>Type:</Text></Column>
                <Column><Text style={detailValue}>{props.appointmentType}</Text></Column>
              </Row>
              
              <Row style={detailRow}>
                <Column><Text style={detailLabel}>Date:</Text></Column>
                <Column><Text style={detailValue}>{props.appointmentDate}</Text></Column>
              </Row>
              
              <Row style={detailRow}>
                <Column><Text style={detailLabel}>Time:</Text></Column>
                <Column><Text style={detailValue}>{props.appointmentTime}</Text></Column>
              </Row>
              
              <Row style={detailRow}>
                <Column><Text style={detailLabel}>Duration:</Text></Column>
                <Column><Text style={detailValue}>{props.duration} minutes</Text></Column>
              </Row>

              {props.notes && (
                <Section style={{ marginTop: '16px' }}>
                  <Text style={detailLabel}>Notes:</Text>
                  <Text style={{ ...detailValue, marginTop: '4px' }}>{props.notes}</Text>
                </Section>
              )}
            </Section>

            {/* CTA Button */}
            {props.eventLink && (
              <Section style={{ textAlign: 'center', marginTop: '24px', marginBottom: '24px' }}>
                <Link
                  href={props.eventLink}
                  style={{ ...button, backgroundColor: primaryColor }}
                >
                  View in Calendar
                </Link>
              </Section>
            )}

            <Hr style={divider} />

            {/* Contact Info */}
            <Text style={paragraph}>
              Need to cancel or reschedule?
            </Text>
            <Text style={{ ...paragraph, marginTop: '8px' }}>
              {props.branding?.contactPhone && (
                <>Call us at <strong>{props.branding.contactPhone}</strong> or </>
              )}
              {props.branding?.contactEmail && (
                <>email <Link href={`mailto:${props.branding.contactEmail}`} style={link}>{props.branding.contactEmail}</Link></>
              )}
              {!props.branding?.contactPhone && !props.branding?.contactEmail && (
                'Please contact us at your earliest convenience.'
              )}
            </Text>

            <Text style={smallText}>
              This appointment was booked via AI Receptionist.
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              {businessName}
            </Text>
            {props.branding?.address && (
              <Text style={footerText}>
                {props.branding.address}
              </Text>
            )}
            {props.branding?.website && (
              <Text style={footerText}>
                <Link href={props.branding.website} style={footerLink}>
                  {props.branding.website}
                </Link>
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );

  return { html, subject };
}

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
};

const header = {
  padding: '24px 24px 0',
  textAlign: 'center' as const,
};

const logo = {
  height: '50px',
  margin: '0 auto',
};

const logoText = {
  fontSize: '24px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '0',
  color: '#1a1a1a',
};

const content = {
  padding: '0 24px',
};

const heading = {
  fontSize: '24px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '24px 0 16px',
  color: '#1a1a1a',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '26px',
  color: '#404040',
  margin: '16px 0',
};

const detailsCard = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '20px',
  marginTop: '24px',
  marginBottom: '8px',
};

const detailsHeading = {
  fontSize: '16px',
  fontWeight: 'bold',
  color: '#1a1a1a',
  margin: '0 0 16px 0',
};

const detailRow = {
  marginBottom: '12px',
};

const detailLabel = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#6b7280',
  margin: '0',
  minWidth: '100px',
};

const detailValue = {
  fontSize: '14px',
  color: '#1a1a1a',
  margin: '0',
};

const button = {
  backgroundColor: '#3b82f6',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 32px',
};

const link = {
  color: '#3b82f6',
  textDecoration: 'underline',
};

const divider = {
  borderColor: '#e5e7eb',
  margin: '24px 0',
};

const smallText = {
  fontSize: '12px',
  color: '#9ca3af',
  marginTop: '16px',
  textAlign: 'center' as const,
};

const footer = {
  textAlign: 'center' as const,
  marginTop: '32px',
  padding: '0 24px',
};

const footerText = {
  fontSize: '12px',
  color: '#9ca3af',
  lineHeight: '16px',
  margin: '4px 0',
};

const footerLink = {
  color: '#9ca3af',
  textDecoration: 'underline',
};
