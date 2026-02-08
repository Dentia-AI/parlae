import { formatDate } from 'date-fns';
import { CurrentPlanBadge } from '@kit/billing-gateway/components';
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

import { formatCurrency } from '@kit/shared/utils';

type OrderLineItem = {
  id: string;
  variantId: string | null;
};

type OrderWithItems = {
  id: string;
  status: string;
  currency: string;
  totalAmount: number;
  createdAt: Date;
  items: OrderLineItem[];
};

interface Props {
  orders: ReadonlyArray<OrderWithItems>;
  locale: string;
}

export function PersonalAccountOrdersCard({ orders, locale }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans i18nKey="billing:ordersCardTitle" defaults="Payment history" />
        </CardTitle>

        <CardDescription>
          <Trans
            i18nKey="billing:ordersCardDescription"
            defaults="Recent charges for your account."
          />
        </CardDescription>
      </CardHeader>

      <CardContent>
        {orders.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Trans i18nKey="billing:ordersTableHeaders.date" defaults="Date" />
                </TableHead>
                <TableHead>
                  <Trans i18nKey="billing:ordersTableHeaders.plan" defaults="Plan" />
                </TableHead>
                <TableHead className="text-right">
                  <Trans
                    i18nKey="billing:ordersTableHeaders.total"
                    defaults="Amount"
                  />
                </TableHead>
                <TableHead className="text-right">
                  <Trans
                    i18nKey="billing:ordersTableHeaders.status"
                    defaults="Status"
                  />
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {orders.map((order) => {
                const primaryItem = order.items[0];
                const currencyCode = order.currency.toUpperCase();
                const orderStatus = (order.status ?? 'pending').toLowerCase();

                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      {formatDate(order.createdAt, 'PPP')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {primaryItem?.variantId ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency({
                        currencyCode,
                        locale,
                        value: order.totalAmount / 100,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <CurrentPlanBadge status={orderStatus} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <EmptyState className="py-10">
            <EmptyMedia variant="icon">
              <span className="text-2xl">💳</span>
            </EmptyMedia>

            <EmptyStateHeading>
              <Trans
                i18nKey="billing:ordersEmptyHeading"
                defaults="No payments yet"
              />
            </EmptyStateHeading>

            <EmptyStateText>
              <Trans
                i18nKey="billing:ordersEmptyDescription"
                defaults="Your invoices and one-time purchases will show up here once payments are processed."
              />
            </EmptyStateText>
          </EmptyState>
        )}
      </CardContent>
    </Card>
  );
}
