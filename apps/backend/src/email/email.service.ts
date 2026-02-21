import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { StructuredLogger } from '../common/structured-logger';

@Injectable()
export class EmailService {
  private readonly logger = new StructuredLogger(EmailService.name);
  private sesClient: SESClient | null = null;

  constructor(private configService: ConfigService) {
    this.initializeSES();
  }

  private initializeSES() {
    const region = this.configService.get<string>('AWS_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    if (!region || !accessKeyId || !secretAccessKey) {
      this.logger.warn('AWS SES credentials not configured');
      return;
    }

    this.sesClient = new SESClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    this.logger.log('AWS SES email service initialized');
  }

  async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }): Promise<void> {
    if (!this.sesClient) {
      throw new Error('AWS SES not configured');
    }

    const fromEmail = params.from || this.configService.get<string>('EMAIL_FROM') || 'noreply@parlae.ca';
    const fromName = this.configService.get<string>('EMAIL_FROM_NAME') || 'Parlae AI';

    try {
      const command = new SendEmailCommand({
        Source: `${fromName} <${fromEmail}>`,
        Destination: {
          ToAddresses: [params.to],
        },
        Message: {
          Subject: {
            Data: params.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: params.html,
              Charset: 'UTF-8',
            },
          },
        },
      });

      await this.sesClient.send(command);

      this.logger.log({
        to: params.to,
        subject: params.subject,
        msg: 'Email sent successfully',
      });
    } catch (error) {
      this.logger.error('Failed to send email', error);
      throw error;
    }
  }
}
