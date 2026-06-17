import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AdminService } from './admin.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { ListAdminQueryDto } from './dto/list-admin-query.dto';
import { RejectProductDto } from './dto/reject-product.dto';
import { UpdateAdminSettingsDto } from './dto/update-admin-settings.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  getDashboard(@Session() session: UserSession) {
    return this.adminService.getDashboard(session.user.id);
  }

  @Get('banners')
  listBanners(@Session() session: UserSession) {
    return this.adminService.listBanners(session.user.id);
  }

  @Post('banners')
  createBanner(@Session() session: UserSession, @Body() dto: CreateBannerDto) {
    return this.adminService.createBanner(session.user.id, dto);
  }

  @Patch('banners/:id')
  updateBanner(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: UpdateBannerDto,
  ) {
    return this.adminService.updateBanner(session.user.id, id, dto);
  }

  @Delete('banners/:id')
  deleteBanner(@Session() session: UserSession, @Param('id') id: string) {
    return this.adminService.deleteBanner(session.user.id, id);
  }

  @Get('settings')
  getSettings(@Session() session: UserSession) {
    return this.adminService.getSettings(session.user.id);
  }

  @Patch('settings')
  updateSettings(
    @Session() session: UserSession,
    @Body() dto: UpdateAdminSettingsDto,
  ) {
    return this.adminService.updateSettings(session.user.id, dto);
  }

  @Get('audit-logs')
  listAuditLogs(
    @Session() session: UserSession,
    @Query() query: ListAuditLogsQueryDto,
  ) {
    return this.adminService.listAuditLogs(session.user.id, query);
  }

  @Get('users')
  listUsers(
    @Session() session: UserSession,
    @Query() query: ListAdminQueryDto,
  ) {
    return this.adminService.listUsers(session.user.id, query);
  }

  @Get('users/:id')
  getUser(@Session() session: UserSession, @Param('id') id: string) {
    return this.adminService.getUser(session.user.id, id);
  }

  @Patch('users/:id/suspend')
  suspendUser(@Session() session: UserSession, @Param('id') id: string) {
    return this.adminService.setUserActive(session.user.id, id, false);
  }

  @Patch('users/:id/reactivate')
  reactivateUser(@Session() session: UserSession, @Param('id') id: string) {
    return this.adminService.setUserActive(session.user.id, id, true);
  }

  @Get('products/moderation')
  listModerationProducts(
    @Session() session: UserSession,
    @Query() query: ListAdminQueryDto,
  ) {
    return this.adminService.listModerationProducts(session.user.id, query);
  }

  @Patch('products/:id/approve')
  approveProduct(@Session() session: UserSession, @Param('id') id: string) {
    return this.adminService.approveProduct(session.user.id, id);
  }

  @Patch('products/:id/reject')
  rejectProduct(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: RejectProductDto,
  ) {
    return this.adminService.rejectProduct(session.user.id, id, dto);
  }

  @Get('reviews/flagged')
  listFlaggedReviews(@Session() session: UserSession) {
    return this.adminService.listFlaggedReviews(session.user.id);
  }

  @Patch('reviews/:id/resolve-flag')
  resolveReviewFlag(@Session() session: UserSession, @Param('id') id: string) {
    return this.adminService.resolveReviewFlag(session.user.id, id);
  }
}
