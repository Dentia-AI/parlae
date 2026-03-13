import { IsString, IsOptional, IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Sikka Registration Handshake webhook payload for new purchases.
 * Sent to POST /pms/purchase when a practice installs our custom SPU
 * and completes registration on the Sikka Marketplace.
 *
 * Sikka sends PascalCase field names (e.g. MasterCustomerID, FirstName).
 */
export class SikkaPurchaseWebhookDto {
  @IsString()
  @IsOptional()
  Source?: string;

  @IsString()
  @IsOptional()
  SPUInstallationKey?: string;

  @IsString()
  @IsOptional()
  MasterCustomerID?: string;

  @IsString()
  @IsOptional()
  UserName?: string;

  @IsString()
  @IsOptional()
  Speciality?: string;

  @IsString()
  @IsOptional()
  PostalCode?: string;

  @IsString()
  @IsOptional()
  PracticePhoneNumber?: string;

  @IsString()
  @IsOptional()
  PracticeCity?: string;

  @IsString()
  @IsOptional()
  PracticeState?: string;

  @IsString()
  @IsOptional()
  PracticeCountry?: string;

  @IsString()
  @IsOptional()
  FirstName?: string;

  @IsString()
  @IsOptional()
  LastName?: string;

  @IsEmail()
  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase().trim())
  EmailAddress?: string;

  @IsString()
  @IsOptional()
  'Order#'?: string;

  @IsString()
  @IsOptional()
  PartnerServiceName?: string;

  @IsString()
  @IsOptional()
  PartnerServiceSKUName?: string;

  @IsString()
  @IsOptional()
  PartnerServiceSKUPrice?: string;

  @IsString()
  @IsOptional()
  Status?: string;

  @IsString()
  @IsOptional()
  PurchaseDate?: string;

  @IsString()
  @IsOptional()
  CancelDate?: string;

  @IsString()
  @IsOptional()
  PartnerRegistrationID?: string;

  @IsString()
  @IsOptional()
  PracticeName?: string;

  @IsString()
  @IsOptional()
  PracticeStreetAddress?: string;
}

/**
 * Sikka Registration Handshake webhook payload for partner cancellation.
 * Sent to POST /pms/cancel when a practice cancels our service.
 */
export class SikkaCancelWebhookDto extends SikkaPurchaseWebhookDto {}
