import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AddWishlistItemDto } from './dto/add-wishlist-item.dto';
import { WishlistService } from './wishlist.service';

@ApiTags('Wishlist')
@ApiBearerAuth()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  list(@Session() session: UserSession) {
    return this.wishlistService.list(session.user.id);
  }

  @Post()
  add(@Session() session: UserSession, @Body() dto: AddWishlistItemDto) {
    return this.wishlistService.add(session.user.id, dto);
  }

  @Post('toggle')
  toggle(@Session() session: UserSession, @Body() dto: AddWishlistItemDto) {
    return this.wishlistService.toggle(session.user.id, dto);
  }

  @Delete(':productId')
  remove(
    @Session() session: UserSession,
    @Param('productId') productId: string,
  ) {
    return this.wishlistService.remove(session.user.id, productId);
  }
}
