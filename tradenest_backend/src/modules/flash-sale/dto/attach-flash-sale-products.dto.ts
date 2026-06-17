import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { FlashSaleProductDto } from './flash-sale-product.dto';

export class AttachFlashSaleProductsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlashSaleProductDto)
  products!: FlashSaleProductDto[];
}
