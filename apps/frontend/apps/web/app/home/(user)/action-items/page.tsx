import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { ActionItemsList } from './_components/action-items-list';

export const metadata = {
  title: 'Action Items',
};

export default function ActionItemsPage() {
  return (
    <PageBody className="pt-4 pb-0 min-h-0 overflow-hidden">
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <div className="flex-shrink-0 pb-4">
          <h1 className="text-2xl font-bold">
            <Trans i18nKey="common:actionItems.pageTitle" />
          </h1>
          <p className="text-muted-foreground">
            <Trans i18nKey="common:actionItems.pageDescription" />
          </p>
        </div>
        <ActionItemsList />
      </div>
    </PageBody>
  );
}
