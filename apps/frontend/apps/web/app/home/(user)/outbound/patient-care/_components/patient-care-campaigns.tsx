'use client';

import { useTranslation } from 'react-i18next';
import { CampaignListClient } from '../../_components/campaign-list-client';

interface PatientCareCampaignsProps {
  callTypes: string[];
}

export function PatientCareCampaigns({ callTypes }: PatientCareCampaignsProps) {
  const { t } = useTranslation('common');

  return (
    <CampaignListClient
      group="PATIENT_CARE"
      callTypes={callTypes}
      callTypeLabelFn={(type) =>
        t(`outbound.patientCare.callTypes.${type.toLowerCase()}`, type)
      }
      channelLabelFn={(channel) =>
        t(`outbound.channels.${channel.toLowerCase()}`)
      }
      emptyMessageKey="outbound.patientCare.noCampaigns"
      campaignsHeadingKey="outbound.patientCare.campaigns"
      summaryGridCols="sm:grid-cols-3"
    />
  );
}
