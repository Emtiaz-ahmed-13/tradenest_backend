import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      message: 'TradeNest API is running',
      data: {
        status: 'ok',
        service: 'tradenest-backend',
      },
    };
  }
}
