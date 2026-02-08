import { Badge } from '@kit/ui/badge';
import { Trans } from '@kit/ui/trans';

type StatusKey =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'
  | 'succeeded'
  | 'pending'
  | 'failed'
  | 'free';

type Status = string;

const statusBadgeMap: Record<StatusKey, `success` | `destructive` | `warning`> = {
  active: 'success',
  succeeded: 'success',
  trialing: 'success',
  past_due: 'destructive',
  failed: 'destructive',
  canceled: 'destructive',
  unpaid: 'destructive',
  incomplete: 'warning',
  pending: 'warning',
  incomplete_expired: 'destructive',
  paused: 'warning',
  free: 'success',
};

export function CurrentPlanBadge(
  props: React.PropsWithoutRef<{
    status: Status;
  }>,
) {
  const normalized = props.status.toLowerCase() as StatusKey;
  const text = `billing:status.${normalized}.badge`;
  const variant = statusBadgeMap[normalized] ?? 'warning';

  return (
    <Badge data-test={'current-plan-card-status-badge'} variant={variant}>
      <Trans i18nKey={text} />
    </Badge>
  );
}
