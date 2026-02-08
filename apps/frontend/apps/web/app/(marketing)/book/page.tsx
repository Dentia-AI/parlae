'use client';

import { GHLCalendarEmbed } from '@kit/shared/gohighlevel';

export default function BookingPage() {
  const calendarId = process.env.NEXT_PUBLIC_GHL_CALENDAR_ID;

  if (!calendarId) {
    return (
      <div className="container mx-auto py-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-center p-8 border border-yellow-300 rounded-lg bg-yellow-50">
            <div className="text-center">
              <p className="text-yellow-700 font-medium">Calendar Not Configured</p>
              <p className="text-yellow-600 text-sm mt-1">
                Please contact support to schedule an appointment.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            Book a Call
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Schedule a time to chat with our team. Pick a date and time that works best for you.
          </p>
        </div>

        <div className="w-full">
          <GHLCalendarEmbed calendarId={calendarId} height="700px" />
        </div>
      </div>
    </div>
  );
}

