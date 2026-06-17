import { IsString, IsUrl, MaxLength } from 'class-validator';

export class SubmitKycDto {
  @IsString()
  @MaxLength(40)
  nidNumber!: string;

  @IsUrl({ require_tld: false })
  @MaxLength(1000)
  frontImageUrl!: string;

  @IsUrl({ require_tld: false })
  @MaxLength(1000)
  backImageUrl!: string;

  @IsUrl({ require_tld: false })
  @MaxLength(1000)
  selfieUrl!: string;
}
