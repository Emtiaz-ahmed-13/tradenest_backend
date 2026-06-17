import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { ApplyCouponDto } from './dto/apply-coupon.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { CouponsService } from './coupons.service';

@ApiTags('Coupons')
@ApiBearerAuth()
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post()
  create(@Session() session: UserSession, @Body() dto: CreateCouponDto) {
    return this.couponsService.create(session.user.id, dto);
  }

  @Get(':code')
  @AllowAnonymous()
  findByCode(@Param('code') code: string) {
    return this.couponsService.findByCode(code);
  }

  @Post('validate')
  @AllowAnonymous()
  validate(@Body() dto: ValidateCouponDto) {
    return this.couponsService.validate(dto);
  }

  @Post('apply')
  apply(@Session() session: UserSession, @Body() dto: ApplyCouponDto) {
    return this.couponsService.apply(session.user.id, dto);
  }
}
