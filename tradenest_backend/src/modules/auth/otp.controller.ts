import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { SendOtpDto, VerifyOtpDto } from './dto/otp.dto';
import { OtpService } from './otp.service';

@ApiTags('Auth OTP')
@Controller('auth/otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('phone/send')
  @AllowAnonymous()
  sendPhoneOtp(@Body() dto: SendOtpDto) {
    return this.otpService.sendPhoneOtp(dto.phone!);
  }

  @Post('phone/verify')
  @AllowAnonymous()
  verifyPhoneOtp(@Body() dto: VerifyOtpDto) {
    return this.otpService.verifyPhoneOtp(dto.phone!, dto.code);
  }

  @Post('email/send')
  @AllowAnonymous()
  sendEmailOtp(@Body() dto: SendOtpDto) {
    return this.otpService.sendEmailOtp(dto.email!);
  }

  @Post('email/verify')
  @AllowAnonymous()
  verifyEmailOtp(@Body() dto: VerifyOtpDto) {
    return this.otpService.verifyEmailOtp(dto.email!, dto.code);
  }
}
