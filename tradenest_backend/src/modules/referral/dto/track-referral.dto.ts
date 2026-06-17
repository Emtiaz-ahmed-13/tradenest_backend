import { IsString, MaxLength } from 'class-validator';

export class TrackReferralDto {
  @IsString()
  @MaxLength(40)
  code!: string;
}
