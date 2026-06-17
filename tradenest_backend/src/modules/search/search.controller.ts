import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @AllowAnonymous()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30_000)
  search(@Query() query: SearchQueryDto, @Session() session?: UserSession) {
    return this.searchService.search(query, session?.user.id);
  }

  @Get('autocomplete')
  @AllowAnonymous()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30_000)
  autocomplete(@Query('q') q?: string) {
    return this.searchService.autocomplete(q);
  }

  @Get('trending')
  @AllowAnonymous()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30_000)
  trending() {
    return this.searchService.trending();
  }

  @Get('recent')
  recent(@Session() session: UserSession) {
    return this.searchService.recent(session.user.id);
  }
}
