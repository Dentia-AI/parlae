import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Trans } from '@kit/ui/trans';

type StatusKey =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

type Status = string;

const statusBadgeMap: Record<StatusKey, `success` | `destructive` | `warning`> = {
  active: 'success',
  trialing: 'success',
  past_due: 'destructive',
  canceled: 'destructive',
  unpaid: 'destructive',
  incomplete: 'warning',
  incomplete_expired: 'destructive',
  paused: 'warning',
};

export function CurrentPlanAlert(
  props: React.PropsWithoutRef<{
    status: Status;
  }>,
) {
  const prefix = 'billing:status';

  const normalized = props.status.toLowerCase() as StatusKey;
  const text = `${prefix}.${normalized}.description`;
  const title = `${prefix}.${normalized}.heading`;
  const variant = statusBadgeMap[normalized] ?? 'warning';

  return (
    <Alert variant={variant}>
      <AlertTitle>
        <Trans i18nKey={title} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={text} />
      </AlertDescription>
    </Alert>
  );
}
