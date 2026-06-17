import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { CreditWalletDto } from './dto/credit-wallet.dto';
import { DebitWalletDto } from './dto/debit-wallet.dto';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('me')
  getMe(@Session() session: UserSession) {
    return this.walletService.getMe(session.user.id);
  }

  @Get('me/transactions')
  listTransactions(@Session() session: UserSession) {
    return this.walletService.listTransactions(session.user.id);
  }

  @Post('hold')
  hold(@Session() session: UserSession, @Body() dto: DebitWalletDto) {
    return this.walletService.hold(session.user.id, dto);
  }

  @Post('release')
  release(@Session() session: UserSession, @Body() dto: CreditWalletDto) {
    return this.walletService.release(session.user.id, dto);
  }

  @Post('refund')
  refund(@Session() session: UserSession, @Body() dto: CreditWalletDto) {
    return this.walletService.refund(session.user.id, dto);
  }
}
