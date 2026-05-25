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
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@ApiTags('Cart')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@Session() session: UserSession) {
    return this.cartService.getCart(session.user.id);
  }

  @Post('items')
  addItem(@Session() session: UserSession, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(session.user.id, dto);
  }

  @Patch('items/:itemId')
  updateItem(
    @Session() session: UserSession,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(session.user.id, itemId, dto);
  }

  @Delete('items/:itemId')
  removeItem(@Session() session: UserSession, @Param('itemId') itemId: string) {
    return this.cartService.removeItem(session.user.id, itemId);
  }

  @Delete()
  clearCart(@Session() session: UserSession) {
    return this.cartService.clearCart(session.user.id);
  }
}
