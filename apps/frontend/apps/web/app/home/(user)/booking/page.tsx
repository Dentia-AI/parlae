import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';
import { GHLCalendarEmbed } from '@kit/shared/gohighlevel';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AlertCircle, Calendar } from 'lucide-react';

import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();
  const title = i18n.t('common:bookingPage');

  return {
    title,
  };
};

function BookingPage() {
  const calendarId = process.env.NEXT_PUBLIC_GHL_CALENDAR_ID || '';

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-4">
        <Calendar className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">
          <Trans i18nKey="common:bookAppointment" defaults="Book an Appointment" />
        </h1>
      </div>
      
      <p className="text-muted-foreground mb-8 text-lg">
        <Trans 
          i18nKey="common:bookAppointmentDescription" 
          defaults="Select a time that works for you to meet with our team" 
        />
      </p>
      
      <PageBody>
        {calendarId ? (
          <div className="max-w-5xl mx-auto">
            <GHLCalendarEmbed 
              calendarId={calendarId}
              height="700px"
              className="w-full"
            />
          </div>
        ) : (
          <Alert variant="destructive" className="max-w-2xl mx-auto">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>
              <Trans i18nKey="common:configurationError" defaults="Configuration Error" />
            </AlertTitle>
            <AlertDescription>
              <Trans 
                i18nKey="common:calendarNotConfigured" 
                defaults="Calendar is not configured. Please set NEXT_PUBLIC_GHL_CALENDAR_ID environment variable." 
              />
            </AlertDescription>
          </Alert>
        )}
      </PageBody>
    </div>
  );
}

export default withI18n(BookingPage);

