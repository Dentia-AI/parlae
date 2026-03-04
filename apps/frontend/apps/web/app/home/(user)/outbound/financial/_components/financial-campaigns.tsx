'use client';

import { useTranslation } from 'react-i18next';
import { CampaignListClient } from '../../_components/campaign-list-client';

interface FinancialCampaignsProps {
  callTypes: string[];
}

export function FinancialCampaigns({ callTypes }: FinancialCampaignsProps) {
  const { t } = useTranslation('common');

  return (
    <CampaignListClient
      group="FINANCIAL"
      callTypes={callTypes}
      callTypeLabelFn={(type) =>
        t(`outbound.financial.callTypes.${type.toLowerCase()}`, type)
      }
      channelLabelFn={(channel) =>
        t(`outbound.channels.${channel.toLowerCase()}`)
      }
      emptyMessageKey="outbound.financial.noCampaigns"
      campaignsHeadingKey="outbound.financial.campaigns"
      summaryGridCols="sm:grid-cols-2"
    />
  );
}
