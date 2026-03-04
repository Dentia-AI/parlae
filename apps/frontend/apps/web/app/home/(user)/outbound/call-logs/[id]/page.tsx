import { PageBody } from '@kit/ui/page';

import { OutboundCallLogDetail } from './_components/outbound-call-log-detail';

export const metadata = {
  title: 'Outbound Call Details',
  description: 'View detailed outbound call record including transcript and AI analysis',
};

export default async function OutboundCallLogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PageBody className="pt-4">
      <OutboundCallLogDetail callId={id} />
    </PageBody>
  );
}
