import { Shield } from 'lucide-react';
import { cn } from '@kit/ui/utils';
import { Trans } from '@kit/ui/trans';

export function HipaaBadge({ className }: { className?: string }) {
  return (
    <div className={cn('inline-flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2', className)}>
      <Shield className="h-5 w-5 text-green-500" />
      <span className="text-sm font-semibold text-green-500">
        <Trans i18nKey="marketing:hipaaCompliant" />
      </span>
    </div>
  );
}

export function HipaaInlineBadge() {
  return (
    <div className="flex items-center gap-2">
      <Shield className="h-5 w-5 text-green-500" />
      <span className="text-sm font-medium">
        <Trans i18nKey="marketing:hipaaCompliant" />
      </span>
    </div>
  );
}
