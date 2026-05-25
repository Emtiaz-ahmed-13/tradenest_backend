import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { AppService } from './app.service';

@ApiTags('Health')
@AllowAnonymous()
@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: 'Health check' })
  getHealth() {
    return this.appService.getHealth();
  }
}
