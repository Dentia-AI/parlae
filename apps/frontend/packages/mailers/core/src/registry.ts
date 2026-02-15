import { Mailer } from '@kit/mailers-shared';
import { createRegistry } from '@kit/shared/registry';

import { MailerProvider } from './provider-enum';

const mailerRegistry = createRegistry<Mailer, MailerProvider>();

mailerRegistry.register('nodemailer', async () => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { createNodemailerService } = await import('@kit/nodemailer');

    return createNodemailerService();
  } else {
    throw new Error(
      'Nodemailer is not available on the edge runtime. Please use another mailer.',
    );
  }
});

mailerRegistry.register('resend', async () => {
  const { createResendMailer } = await import('@kit/resend');

  return createResendMailer();
});

mailerRegistry.register('aws-ses', async () => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { createAwsSesMailer } = await import('@kit/mailers-aws-ses');

    return createAwsSesMailer();
  } else {
    throw new Error(
      'AWS SES is not available on the edge runtime. Please use another mailer.',
    );
  }
});

export { mailerRegistry };
