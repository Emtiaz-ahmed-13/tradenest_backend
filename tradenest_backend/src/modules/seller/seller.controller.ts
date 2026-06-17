import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { SellerAnalyticsQueryDto } from './dto/seller-analytics-query.dto';
import { SellerService } from './seller.service';

@ApiTags('Seller')
@ApiBearerAuth()
@Controller('seller')
export class SellerController {
  constructor(private readonly sellerService: SellerService) {}

  @Get('dashboard')
  getDashboard(
    @Session() session: UserSession,
    @Query() query: SellerAnalyticsQueryDto,
  ) {
    return this.sellerService.getDashboard(session.user.id, query);
  }

  @Get('analytics')
  getAnalytics(
    @Session() session: UserSession,
    @Query() query: SellerAnalyticsQueryDto,
  ) {
    return this.sellerService.getAnalytics(session.user.id, query);
  }

  @Get('products-performance')
  getProductsPerformance(
    @Session() session: UserSession,
    @Query() query: SellerAnalyticsQueryDto,
  ) {
    return this.sellerService.getProductsPerformance(session.user.id, query);
  }
}
