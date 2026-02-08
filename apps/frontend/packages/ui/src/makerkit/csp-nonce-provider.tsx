'use client';

import { createContext, useContext } from 'react';

const CspNonceContext = createContext<string | undefined>(undefined);

type CspNonceProviderProps = React.PropsWithChildren<{
  nonce?: string;
}>;

export function CspNonceProvider({
  nonce,
  children,
}: CspNonceProviderProps) {
  return (
    <CspNonceContext.Provider value={nonce}>
      {children}
    </CspNonceContext.Provider>
  );
}

export function useCspNonce() {
  return useContext(CspNonceContext);
}
