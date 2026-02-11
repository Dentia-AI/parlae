import { IsString, IsOptional } from 'class-validator';

export class SikkaOAuthCallbackDto {
  @IsString()
  code: string; // Authorization code from Sikka

  @IsString()
  state: string; // State we sent (contains accountId)

  @IsString()
  @IsOptional()
  error?: string; // If user denied authorization

  @IsString()
  @IsOptional()
  error_description?: string;
}
