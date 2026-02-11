import { Injectable, Logger } from '@nestjs/common';
import { SecretsManagerClient, GetSecretValueCommand, CreateSecretCommand, PutSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export interface SikkaPracticeCredentials {
  officeId: string;
  secretKey: string;
  requestKey?: string;
  refreshKey?: string;
  tokenExpiry?: string;
  practiceName?: string;
  practiceId?: string;
  pmsType?: string; // The actual PMS they use (Dentrix, Eaglesoft, etc.)
}

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);
  private readonly client: SecretsManagerClient;
  private readonly secretPrefix = 'parlae/pms/sikka';

  constructor() {
    this.client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }

  /**
   * Get practice credentials from AWS Secrets Manager
   */
  async getPracticeCredentials(accountId: string): Promise<SikkaPracticeCredentials | null> {
    try {
      const secretName = `${this.secretPrefix}/${accountId}`;
      
      const command = new GetSecretValueCommand({
        SecretId: secretName,
      });

      const response = await this.client.send(command);
      
      if (!response.SecretString) {
        return null;
      }

      return JSON.parse(response.SecretString);
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        return null;
      }
      this.logger.error(`Failed to get practice credentials: ${error.message}`);
      throw error;
    }
  }

  /**
   * Store practice credentials in AWS Secrets Manager
   */
  async storePracticeCredentials(
    accountId: string,
    credentials: SikkaPracticeCredentials,
  ): Promise<string> {
    try {
      const secretName = `${this.secretPrefix}/${accountId}`;
      const secretValue = JSON.stringify(credentials);

      try {
        // Try to create new secret
        const createCommand = new CreateSecretCommand({
          Name: secretName,
          Description: `Sikka practice credentials for account ${accountId}`,
          SecretString: secretValue,
          Tags: [
            { Key: 'AccountId', Value: accountId },
            { Key: 'Service', Value: 'Parlae' },
            { Key: 'Type', Value: 'PMS-Sikka' },
          ],
        });

        const response = await this.client.send(createCommand);
        this.logger.log(`Created secret: ${secretName}`);
        return response.ARN!;
      } catch (error: any) {
        if (error.name === 'ResourceExistsException') {
          // Secret exists, update it
          const putCommand = new PutSecretValueCommand({
            SecretId: secretName,
            SecretString: secretValue,
          });

          await this.client.send(putCommand);
          this.logger.log(`Updated secret: ${secretName}`);
          
          // Get ARN
          const getCommand = new GetSecretValueCommand({ SecretId: secretName });
          const getResponse = await this.client.send(getCommand);
          return getResponse.ARN!;
        }
        throw error;
      }
    } catch (error: any) {
      this.logger.error(`Failed to store practice credentials: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update tokens in existing secret
   */
  async updatePracticeTokens(
    accountId: string,
    tokens: {
      requestKey: string;
      refreshKey: string;
      tokenExpiry: string;
    },
  ): Promise<void> {
    const existing = await this.getPracticeCredentials(accountId);
    
    if (!existing) {
      throw new Error(`No practice credentials found for account ${accountId}`);
    }

    await this.storePracticeCredentials(accountId, {
      ...existing,
      ...tokens,
    });
  }
}
