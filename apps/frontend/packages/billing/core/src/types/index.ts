export type BillingProvider = 'stripe';

export type SubscriptionLineItem = {
  id: string;
  quantity: number;
  subscription_id: string;
  subscription_item_id: string;
  product_id: string;
  variant_id: string;
  price_amount: number | null | undefined;
  interval: string;
  interval_count: number;
  type: 'flat' | 'metered' | 'per_seat' | undefined;
};

export type UpsertSubscriptionParams = {
  target_account_id: string;
  target_customer_id: string;
  target_subscription_id: string;
  billing_provider: BillingProvider;
  status: string;
  currency: string;
  period_starts_at: string;
  period_ends_at: string;
  cancel_at_period_end: boolean;
  active: boolean;
  line_items: SubscriptionLineItem[];
  trial_starts_at?: string;
  trial_ends_at?: string;
};

export type OrderLineItem = {
  id: string;
  product_id: string;
  variant_id: string;
  price_amount: number | null | undefined;
  quantity: number | null | undefined;
};

export type UpsertOrderParams = {
  target_account_id: string;
  target_customer_id: string;
  target_order_id: string;
  billing_provider: BillingProvider;
  status: string;
  total_amount: number;
  currency: string;
  line_items: OrderLineItem[];
};
