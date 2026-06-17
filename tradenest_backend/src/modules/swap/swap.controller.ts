import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { CreateSwapRequestDto } from './dto/create-swap-request.dto';
import { CounterSwapOfferDto } from './dto/counter-swap-offer.dto';
import { SwapService } from './swap.service';

@ApiTags('Swap')
@ApiBearerAuth()
@Controller('swap')
export class SwapController {
  constructor(private readonly swapService: SwapService) {}

  @Post('requests')
  createRequest(
    @Session() session: UserSession,
    @Body() dto: CreateSwapRequestDto,
  ) {
    return this.swapService.createRequest(session.user.id, dto);
  }

  @Get('requests/mine')
  listMine(@Session() session: UserSession) {
    return this.swapService.listMine(session.user.id);
  }

  @Get('requests/:id')
  findOne(@Session() session: UserSession, @Param('id') id: string) {
    return this.swapService.findOne(session.user.id, id);
  }

  @Post('requests/:id/offers')
  counterOffer(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: CounterSwapOfferDto,
  ) {
    return this.swapService.counterOffer(session.user.id, id, dto);
  }

  @Patch('requests/:id/offers/:offerId/accept')
  acceptOffer(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Param('offerId') offerId: string,
  ) {
    return this.swapService.acceptOffer(session.user.id, id, offerId);
  }

  @Patch('requests/:id/reject')
  reject(@Session() session: UserSession, @Param('id') id: string) {
    return this.swapService.reject(session.user.id, id);
  }

  @Patch('requests/:id/cancel')
  cancel(@Session() session: UserSession, @Param('id') id: string) {
    return this.swapService.cancel(session.user.id, id);
  }

  @Patch('requests/:id/complete')
  complete(@Session() session: UserSession, @Param('id') id: string) {
    return this.swapService.complete(session.user.id, id);
  }
}
