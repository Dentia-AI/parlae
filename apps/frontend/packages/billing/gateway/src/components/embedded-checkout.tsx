import { Suspense, lazy } from 'react';

import { LoadingOverlay } from '@kit/ui/loading-overlay';

type BillingProvider = 'stripe';

// Create lazy components at module level (not during render)
const StripeCheckoutLazy = lazy(async () => {
  const { StripeCheckout } = await import('@kit/stripe/components');
  return { default: StripeCheckout };
});

type CheckoutProps = {
  onClose: (() => unknown) | undefined;
  checkoutToken: string;
};

export function EmbeddedCheckout(
  props: React.PropsWithChildren<{
    checkoutToken: string;
    provider: BillingProvider;
    onClose?: () => void;
  }>,
) {
  return (
    <>
      <Suspense fallback={<LoadingOverlay fullPage={false} />}>
        <CheckoutSelector
          provider={props.provider}
          onClose={props.onClose}
          checkoutToken={props.checkoutToken}
        />
      </Suspense>

      <BlurryBackdrop />
    </>
  );
}

function CheckoutSelector(
  props: CheckoutProps & { provider: BillingProvider },
) {
  switch (props.provider) {
    case 'stripe':
      return (
        <StripeCheckoutLazy
          onClose={props.onClose}
          checkoutToken={props.checkoutToken}
        />
      );

    default:
      throw new Error(`Unsupported provider: ${props.provider as string}`);
  }
}

function BlurryBackdrop() {
  return (
    <div
      className={
        'bg-background/30 fixed top-0 left-0 w-full backdrop-blur-sm' +
        ' !m-0 h-full'
      }
    />
  );
}
