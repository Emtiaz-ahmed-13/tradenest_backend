import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { AttachFlashSaleProductsDto } from './dto/attach-flash-sale-products.dto';
import { CreateFlashSaleDto } from './dto/create-flash-sale.dto';
import { UpdateFlashSaleDto } from './dto/update-flash-sale.dto';
import { FlashSaleService } from './flash-sale.service';

@ApiTags('Flash Sale')
@ApiBearerAuth()
@Controller('flash-sale')
export class FlashSaleController {
  constructor(private readonly flashSaleService: FlashSaleService) {}

  @Post()
  create(@Session() session: UserSession, @Body() dto: CreateFlashSaleDto) {
    return this.flashSaleService.create(session.user.id, dto);
  }

  @Get('active')
  @AllowAnonymous()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30_000)
  listActive() {
    return this.flashSaleService.listActive();
  }

  @Get()
  listAll(@Session() session: UserSession) {
    return this.flashSaleService.listAll(session.user.id);
  }

  @Patch(':id')
  update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: UpdateFlashSaleDto,
  ) {
    return this.flashSaleService.update(session.user.id, id, dto);
  }

  @Patch(':id/activate')
  activate(@Session() session: UserSession, @Param('id') id: string) {
    return this.flashSaleService.activate(session.user.id, id);
  }

  @Patch(':id/cancel')
  cancel(@Session() session: UserSession, @Param('id') id: string) {
    return this.flashSaleService.cancel(session.user.id, id);
  }

  @Post(':id/products')
  attachProducts(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: AttachFlashSaleProductsDto,
  ) {
    return this.flashSaleService.attachProducts(session.user.id, id, dto);
  }
}
