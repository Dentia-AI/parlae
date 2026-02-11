export interface PmsConnectionStatus {
  isConnected: boolean;
  status: 'pending' | 'connecting' | 'connected' | 'failed';
  provider?: string;
  practiceName?: string;
  pmsType?: string;
  error?: string;
  timestamp: string;
}

export class CheckConnectionStatusDto {
  accountId: string;
}
