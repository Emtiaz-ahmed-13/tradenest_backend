import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { PlaceOrderDto } from './dto/place-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  placeFromCart(@Session() session: UserSession, @Body() dto: PlaceOrderDto) {
    return this.ordersService.placeFromCart(session.user.id, dto);
  }

  @Get('mine')
  findBuyerOrders(
    @Session() session: UserSession,
    @Query() query: ListOrdersQueryDto,
  ) {
    return this.ordersService.findBuyerOrders(session.user.id, query);
  }

  @Get('seller')
  findSellerOrders(
    @Session() session: UserSession,
    @Query() query: ListOrdersQueryDto,
  ) {
    return this.ordersService.findSellerOrders(session.user.id, query);
  }

  @Get(':id')
  findOne(@Session() session: UserSession, @Param('id') id: string) {
    return this.ordersService.findOne(session.user.id, id);
  }

  @Get(':id/invoice')
  generateInvoice(@Session() session: UserSession, @Param('id') id: string) {
    return this.ordersService.generateInvoice(session.user.id, id);
  }

  @Patch(':id/cancel')
  cancel(@Session() session: UserSession, @Param('id') id: string) {
    return this.ordersService.cancelOrder(session.user.id, id);
  }

  @Patch(':id/status')
  updateStatus(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(session.user.id, id, dto);
  }
}
