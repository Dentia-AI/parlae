import { redirect, notFound } from 'next/navigation';
import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { RetellTemplateDetail } from './_components/retell-template-detail';

export const metadata = {
  title: 'Retell Template Detail',
};

export default async function RetellTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionUser();

  if (!session) redirect('/auth/sign-in');
  if (!isAdminUser(session.id)) redirect('/404');

  const template = await prisma.retellAgentTemplate.findUnique({
    where: { id },
    include: {
      _count: { select: { accounts: true } },
      accounts: {
        select: {
          id: true,
          name: true,
          brandingBusinessName: true,
          voiceProviderOverride: true,
        },
        take: 50,
      },
    },
  });

  if (!template) notFound();

  // Get all accounts for bulk deploy
  const allAccounts = await prisma.account.findMany({
    where: { isPersonalAccount: true },
    select: {
      id: true,
      name: true,
      brandingBusinessName: true,
      voiceProviderOverride: true,
      retellAgentTemplateId: true,
    },
    orderBy: { name: 'asc' },
    take: 200,
  });

  return (
    <RetellTemplateDetail
      template={JSON.parse(JSON.stringify(template))}
      allAccounts={JSON.parse(JSON.stringify(allAccounts))}
    />
  );
}
