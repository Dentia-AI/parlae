import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient, prisma } from '@kit/prisma';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  // Use the pre-configured Prisma instance from @kit/prisma
  private client: PrismaClient = prisma;

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }

  // Expose Prisma client methods
  get account(): PrismaClient['account'] {
    return this.client.account;
  }

  get user(): PrismaClient['user'] {
    return this.client.user;
  }

  get role(): PrismaClient['role'] {
    return this.client.role;
  }

  get accountMembership(): PrismaClient['accountMembership'] {
    return this.client.accountMembership;
  }

  get rolePermission(): PrismaClient['rolePermission'] {
    return this.client.rolePermission;
  }

  get billingCustomer(): PrismaClient['billingCustomer'] {
    return this.client.billingCustomer;
  }

  get config(): PrismaClient['config'] {
    return this.client.config;
  }

  get invitation(): PrismaClient['invitation'] {
    return this.client.invitation;
  }

  get nonce(): PrismaClient['nonce'] {
    return this.client.nonce;
  }

  get notification(): PrismaClient['notification'] {
    return this.client.notification;
  }

  get order(): PrismaClient['order'] {
    return this.client.order;
  }

  get orderItem(): PrismaClient['orderItem'] {
    return this.client.orderItem;
  }

  get subscription(): PrismaClient['subscription'] {
    return this.client.subscription;
  }

  get subscriptionItem(): PrismaClient['subscriptionItem'] {
    return this.client.subscriptionItem;
  }

  get usageRecord(): PrismaClient['usageRecord'] {
    return this.client.usageRecord;
  }

  get file(): PrismaClient['file'] {
    return this.client.file;
  }

  get sourceContent(): PrismaClient['sourceContent'] {
    return this.client.sourceContent;
  }

  get adProvider(): PrismaClient['adProvider'] {
    return this.client.adProvider;
  }

  get ad(): PrismaClient['ad'] {
    return this.client.ad;
  }

  get userTransaction(): PrismaClient['userTransaction'] {
    return this.client.userTransaction;
  }

  get payment(): PrismaClient['payment'] {
    return this.client.payment;
  }

  get refund(): PrismaClient['refund'] {
    return this.client.refund;
  }

  get cognitoTokens(): PrismaClient['cognitoTokens'] {
    return this.client.cognitoTokens;
  }

  get metaAdCampaign(): PrismaClient['metaAdCampaign'] {
    return this.client.metaAdCampaign;
  }

  get metaAdSet(): PrismaClient['metaAdSet'] {
    return this.client.metaAdSet;
  }

  // GHL Voice Agent models
  get ghlSubAccount(): PrismaClient['ghlSubAccount'] {
    return this.client.ghlSubAccount;
  }

  get voiceAgent(): PrismaClient['voiceAgent'] {
    return this.client.voiceAgent;
  }

  get knowledgeBase(): PrismaClient['knowledgeBase'] {
    return this.client.knowledgeBase;
  }

  get callReference(): PrismaClient['callReference'] {
    return this.client.callReference;
  }

  // PMS Integration models
  get pmsIntegration(): PrismaClient['pmsIntegration'] {
    return this.client.pmsIntegration;
  }

  get pmsWriteback(): PrismaClient['pmsWriteback'] {
    return this.client.pmsWriteback;
  }

  // Vapi models
  get vapiPhoneNumber(): PrismaClient['vapiPhoneNumber'] {
    return this.client.vapiPhoneNumber;
  }

  // Call data is managed by Vapi API — only thin CallReference stored locally.

  // get vapiSquadTemplate(): PrismaClient['vapiSquadTemplate'] {
  //   return this.client.vapiSquadTemplate;
  // }

  // get vapiAssistantTemplate(): PrismaClient['vapiAssistantTemplate'] {
  //   return this.client.vapiAssistantTemplate;
  // }

  // Expose transaction method
  get $transaction(): PrismaClient['$transaction'] {
    return this.client.$transaction.bind(this.client);
  }

  // Expose raw query methods
  get $queryRaw(): PrismaClient['$queryRaw'] {
    return this.client.$queryRaw.bind(this.client);
  }

  get $executeRaw(): PrismaClient['$executeRaw'] {
    return this.client.$executeRaw.bind(this.client);
  }
}
