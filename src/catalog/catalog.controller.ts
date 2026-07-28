import { Controller, Get, Param, Query } from '@nestjs/common';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { CatalogService } from './catalog.service';

@Controller('plans')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  findAll(@Query('region') region?: string, @Query('countryCode') countryCode?: string) {
    return this.catalog.findAll({ region, countryCode });
  }

  @Get('regions')
  listRegions() {
    return this.catalog.listRegions();
  }

  @Get(':id')
  findOne(@Param('id', ParseIdPipe) id: string) {
    return this.catalog.findOne(id);
  }
}
