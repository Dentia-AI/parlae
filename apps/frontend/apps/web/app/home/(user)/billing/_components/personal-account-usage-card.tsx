import { formatDate } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import {
  EmptyMedia,
  EmptyState,
  EmptyStateHeading,
  EmptyStateText,
} from '@kit/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@kit/ui/table';
import { Trans } from '@kit/ui/trans';

type UsageRecordWithItem = {
  id: string;
  quantity: number;
  recordedAt: Date;
  periodStartsAt: Date;
  periodEndsAt: Date;
  subscriptionItem: {
    variantId: string | null;
  };
};

interface Props {
  usageRecords: ReadonlyArray<UsageRecordWithItem>;
}

export function PersonalAccountUsageCard({ usageRecords }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans
            i18nKey="billing:usageRecordsTitle"
            defaults="Usage history"
          />
        </CardTitle>

        <CardDescription>
          <Trans
            i18nKey="billing:usageRecordsDescription"
            defaults="Recent metered usage reported for your plan."
          />
        </CardDescription>
      </CardHeader>

      <CardContent>
        {usageRecords.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Trans
                    i18nKey="billing:usageRecordsTableHeaders.period"
                    defaults="Billing period"
                  />
                </TableHead>
                <TableHead>
                  <Trans
                    i18nKey="billing:usageRecordsTableHeaders.quantity"
                    defaults="Quantity"
                  />
                </TableHead>
                <TableHead>
                  <Trans
                    i18nKey="billing:usageRecordsTableHeaders.item"
                    defaults="Item"
                  />
                </TableHead>
                <TableHead className="text-right">
                  <Trans
                    i18nKey="billing:usageRecordsTableHeaders.reportedAt"
                    defaults="Reported on"
                  />
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {usageRecords.map((record) => {
                const periodStart = formatDate(
                  record.periodStartsAt,
                  'MMM d, yyyy',
                );
                const periodEnd = formatDate(
                  record.periodEndsAt,
                  'MMM d, yyyy',
                );

                return (
                  <TableRow key={record.id}>
                    <TableCell>
                      {periodStart} – {periodEnd}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {record.quantity}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {record.subscriptionItem?.variantId ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatDate(record.recordedAt, 'PPP')}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <EmptyState className="py-10">
            <EmptyMedia variant="icon">
              <span className="text-2xl">📈</span>
            </EmptyMedia>

            <EmptyStateHeading>
              <Trans
                i18nKey="billing:usageRecordsEmptyHeading"
                defaults="No usage recorded yet"
              />
            </EmptyStateHeading>

            <EmptyStateText>
              <Trans
                i18nKey="billing:usageRecordsEmptyDescription"
                defaults="Once metered usage is reported it will appear here."
              />
            </EmptyStateText>
          </EmptyState>
        )}
      </CardContent>
    </Card>
  );
}
