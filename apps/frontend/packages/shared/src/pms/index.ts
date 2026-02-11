export * from './types';
export * from './pms-service.interface';
export * from './sikka.service';

import type { IPmsService } from './pms-service.interface';
import { SikkaPmsService } from './sikka.service';
import type {
  KollaCredentials,
  PmsConfig,
  PmsCredentials,
  PmsProvider,
  SikkaCredentials,
} from './types';

/**
 * Factory function to create a PMS service instance
 * 
 * @param provider PMS provider type
 * @param accountId Account ID
 * @param credentials Provider-specific credentials
 * @param config Optional configuration
 * @returns IPmsService implementation
 */
export function createPmsService(
  provider: PmsProvider,
  accountId: string,
  credentials: PmsCredentials,
  config?: PmsConfig
): IPmsService {
  switch (provider) {
    case 'SIKKA':
      return new SikkaPmsService(
        accountId,
        credentials as SikkaCredentials,
        config
      );
    
    case 'KOLLA':
      // TODO: Implement KollaPmsService
      throw new Error('Kolla PMS integration not yet implemented');
    
    case 'DENTRIX':
    case 'EAGLESOFT':
    case 'OPEN_DENTAL':
    case 'CUSTOM':
      throw new Error(`${provider} PMS integration not yet implemented`);
    
    default:
      throw new Error(`Unknown PMS provider: ${provider}`);
  }
}

/**
 * Validate PMS credentials based on provider
 * 
 * @param provider PMS provider type
 * @param credentials Provider-specific credentials
 * @returns True if valid, throws error if invalid
 */
export function validatePmsCredentials(
  provider: PmsProvider,
  credentials: PmsCredentials
): boolean {
  switch (provider) {
    case 'SIKKA': {
      const sikka = credentials as SikkaCredentials;
      if (!sikka.clientId || !sikka.clientSecret) {
        throw new Error('Sikka credentials require clientId and clientSecret');
      }
      return true;
    }
    
    case 'KOLLA': {
      const kolla = credentials as KollaCredentials;
      if (!kolla.apiKey) {
        throw new Error('Kolla credentials require apiKey');
      }
      return true;
    }
    
    default:
      throw new Error(`Unknown PMS provider: ${provider}`);
  }
}
