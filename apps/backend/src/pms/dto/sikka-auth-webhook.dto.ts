import { IsString, IsOptional } from 'class-validator';

export class SikkaAuthWebhookDto {
  @IsString()
  event: string; // 'app.authorized'

  @IsString()
  office_id: string;

  @IsString()
  secret_key: string;

  @IsString()
  practice_name: string;

  @IsString()
  practice_id: string;

  @IsString()
  @IsOptional()
  pms_type?: string; // The actual PMS (Dentrix, Eaglesoft, etc.)

  @IsString()
  app_id: string; // Should match our app_id
}
