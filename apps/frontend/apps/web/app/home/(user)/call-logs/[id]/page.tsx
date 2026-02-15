import { PageBody } from '@kit/ui/page';

import { CallLogDetail } from './_components/call-log-detail';

export const metadata = {
  title: 'Call Details',
  description: 'View detailed call record including transcript and AI analysis',
};

export default async function CallLogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PageBody className="pt-4">
      <CallLogDetail callId={id} />
    </PageBody>
  );
}
