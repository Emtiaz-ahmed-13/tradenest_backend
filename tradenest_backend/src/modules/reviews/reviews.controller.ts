import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { CreateReviewDto } from './dto/create-review.dto';
import { FlagReviewDto } from './dto/flag-review.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('Reviews')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  create(@Session() session: UserSession, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(session.user.id, dto);
  }

  @Get('product/:productId')
  @AllowAnonymous()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30_000)
  listForProduct(@Param('productId') productId: string) {
    return this.reviewsService.listForProduct(productId);
  }

  @Get('seller/:sellerId')
  @AllowAnonymous()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30_000)
  listForSeller(@Param('sellerId') sellerId: string) {
    return this.reviewsService.listForSeller(sellerId);
  }

  @Patch(':id/reply')
  reply(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: ReplyReviewDto,
  ) {
    return this.reviewsService.reply(session.user.id, id, dto);
  }

  @Patch(':id/flag')
  flag(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: FlagReviewDto,
  ) {
    return this.reviewsService.flag(session.user.id, id, dto);
  }
}
