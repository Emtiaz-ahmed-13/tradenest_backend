import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { CreateAddressDto } from './dto/create-address.dto';
import { SellerOnboardingDto } from './dto/seller-onboarding.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@Session() session: UserSession) {
    return this.usersService.getMe(session.user.id);
  }

  @Patch('me')
  updateProfile(
    @Session() session: UserSession,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(session.user.id, dto);
  }

  @Get('me/addresses')
  listAddresses(@Session() session: UserSession) {
    return this.usersService.listAddresses(session.user.id);
  }

  @Post('me/addresses')
  createAddress(
    @Session() session: UserSession,
    @Body() dto: CreateAddressDto,
  ) {
    return this.usersService.createAddress(session.user.id, dto);
  }

  @Patch('me/addresses/:addressId')
  updateAddress(
    @Session() session: UserSession,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.usersService.updateAddress(session.user.id, addressId, dto);
  }

  @Delete('me/addresses/:addressId')
  deleteAddress(
    @Session() session: UserSession,
    @Param('addressId') addressId: string,
  ) {
    return this.usersService.deleteAddress(session.user.id, addressId);
  }

  @Post('me/seller-onboarding')
  onboardSeller(
    @Session() session: UserSession,
    @Body() dto: SellerOnboardingDto,
  ) {
    return this.usersService.onboardSeller(session.user.id, dto);
  }
}
