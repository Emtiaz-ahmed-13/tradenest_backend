import { IsObject } from 'class-validator';

export class UpdateAdminSettingsDto {
  @IsObject()
  settings!: Record<string, unknown>;
}
