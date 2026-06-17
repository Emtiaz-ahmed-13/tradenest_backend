import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { BulkUploadProductsDto } from './dto/bulk-upload-products.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { UpdateProductStatusDto } from './dto/update-product-status.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Session() session: UserSession, @Body() dto: CreateProductDto) {
    return this.productsService.create(session.user.id, dto);
  }

  @Post('bulk')
  bulkCreate(
    @Session() session: UserSession,
    @Body() dto: BulkUploadProductsDto,
  ) {
    return this.productsService.bulkCreate(session.user.id, dto.products);
  }

  @Get()
  @AllowAnonymous()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30_000)
  findAll(@Query() query: ListProductsQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get('mine')
  findMine(
    @Session() session: UserSession,
    @Query() query: ListProductsQueryDto,
  ) {
    return this.productsService.findMine(session.user.id, query);
  }

  @Get(':idOrSlug')
  @AllowAnonymous()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30_000)
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.productsService.findOne(idOrSlug);
  }

  @Patch(':id')
  update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(session.user.id, id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: UpdateProductStatusDto,
  ) {
    return this.productsService.updateStatus(session.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Session() session: UserSession, @Param('id') id: string) {
    return this.productsService.remove(session.user.id, id);
  }
}
