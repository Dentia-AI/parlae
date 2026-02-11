import { IsEnum, IsOptional, IsObject } from 'class-validator';

export enum PmsProvider {
  SIKKA = 'SIKKA',
  KOLLA = 'KOLLA',
  DENTRIX = 'DENTRIX',
  EAGLESOFT = 'EAGLESOFT',
  OPEN_DENTAL = 'OPEN_DENTAL',
  CUSTOM = 'CUSTOM',
}

export class SetupPmsDto {
  @IsEnum(PmsProvider)
  provider: PmsProvider;

  @IsObject()
  @IsOptional()
  config?: Record<string, any>;
  
  // Note: Credentials come from environment variables, not from user input
  // Frontend just selects which PMS provider to enable
}

export class GetPmsStatusDto {
  // No input parameters needed - uses authenticated user's account
}
