import 'server-only';

import * as nodemailer from 'nodemailer';
import * as aws from '@aws-sdk/client-ses';
import { z } from 'zod';

import { Mailer, MailerSchema } from '@kit/mailers-shared';

type Config = z.infer<typeof MailerSchema>;

const AWS_REGION = z.string().parse(process.env.AWS_REGION || 'us-east-1');
const AWS_ACCESS_KEY_ID = z.string().parse(process.env.AWS_ACCESS_KEY_ID);
const AWS_SECRET_ACCESS_KEY = z.string().parse(process.env.AWS_SECRET_ACCESS_KEY);

export function createAwsSesMailer() {
  return new AwsSesMailer();
}

/**
 * A class representing a mailer using AWS SES via Nodemailer.
 * @implements {Mailer}
 */
class AwsSesMailer implements Mailer {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Create SES client
    const ses = new aws.SES({
      apiVersion: '2010-12-01',
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });

    // Create Nodemailer transporter with SES
    this.transporter = nodemailer.createTransport({
      SES: { ses, aws },
    });
  }

  async sendEmail(config: Config) {
    const contentObject =
      'text' in config
        ? {
            text: config.text,
          }
        : {
            html: config.html,
          };

    try {
      const result = await this.transporter.sendMail({
        from: config.from,
        to: config.to,
        subject: config.subject,
        ...contentObject,
      });

      console.log('Email sent successfully:', result.messageId);
      
      return result;
    } catch (error) {
      console.error('Failed to send email via AWS SES:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}
