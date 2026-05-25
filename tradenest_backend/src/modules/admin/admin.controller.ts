import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AdminService } from './admin.service';
import { ListAdminQueryDto } from './dto/list-admin-query.dto';
import { RejectProductDto } from './dto/reject-product.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
