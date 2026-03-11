import { IsString, IsOptional, IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Sikka Registration Handshake webhook payload for new purchases.
 * Sent to POST /pms/purchase when a practice installs our custom SPU
 * and completes registration on the Sikka Marketplace.
 *
 * Field names come from the Sikka portal "Registration Handshake" config
 * and are sent as JSON (not camelCase).
 */
export class SikkaPurchaseWebhookDto {
  @IsString()
  @IsOptional()
  'Package/Source'?: string;

  @IsString()
  @IsOptional()
  'Master Customer ID'?: string;

  @IsString()
  @IsOptional()
  'UserName'?: string;

  @IsString()
  @IsOptional()
  'Speciality'?: string;

  @IsString()
  @IsOptional()
  'Postal Code'?: string;

  @IsString()
  @IsOptional()
  'Practice Phone Number'?: string;

  @IsString()
  @IsOptional()
  'Practice City'?: string;

  @IsString()
  @IsOptional()
  'Practice State'?: string;

  @IsString()
  @IsOptional()
  'Practice Country'?: string;

  @IsString()
  @IsOptional()
  'First Name'?: string;

  @IsString()
  @IsOptional()
  'Last Name'?: string;

  @IsEmail()
  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase().trim())
  'Email Address'?: string;

  @IsString()
  @IsOptional()
  'Order #'?: string;

  @IsString()
  @IsOptional()
  'Partner Service Name'?: string;

  @IsString()
  @IsOptional()
  'Partner Service SKU Name'?: string;

  @IsString()
  @IsOptional()
  'Partner Service SKU Price'?: string;

  @IsString()
  @IsOptional()
  'Status'?: string;

  @IsString()
  @IsOptional()
  'Purchase Date'?: string;

  @IsString()
  @IsOptional()
  'Cancel Date'?: string;

  @IsString()
  @IsOptional()
  'Partner Registration ID'?: string;

  @IsString()
  @IsOptional()
  'Practice Name'?: string;

  @IsString()
  @IsOptional()
  'Practice Street Address'?: string;
}

/**
 * Sikka Registration Handshake webhook payload for partner cancellation.
 * Sent to POST /pms/cancel when a practice cancels our service.
 */
export class SikkaCancelWebhookDto extends SikkaPurchaseWebhookDto {}
