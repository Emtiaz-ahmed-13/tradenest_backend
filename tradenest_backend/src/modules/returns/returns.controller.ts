import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { CreateReturnRequestDto } from './dto/create-return-request.dto';
import { UpdateReturnRequestDto } from './dto/update-return-request.dto';
import { ReturnsService } from './returns.service';

@ApiTags('Returns')
@ApiBearerAuth()
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post()
  create(@Session() session: UserSession, @Body() dto: CreateReturnRequestDto) {
    return this.returnsService.create(session.user.id, dto);
  }

  @Get('mine')
  listMine(@Session() session: UserSession) {
    return this.returnsService.listMine(session.user.id);
  }

  @Get(':id')
  findOne(@Session() session: UserSession, @Param('id') id: string) {
    return this.returnsService.findOne(session.user.id, id);
  }

  @Patch(':id/status')
  updateStatus(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: UpdateReturnRequestDto,
  ) {
    return this.returnsService.updateStatus(session.user.id, id, dto);
  }
}
