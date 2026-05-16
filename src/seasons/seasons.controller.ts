import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { SeasonsService } from './seasons.service';
import { CreateSeasonDto } from './dto/create-season.dto';
import { UpdateSeasonDto } from './dto/update-season.dto';

@ApiTags('seasons')
@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasons: SeasonsService) {}

  @Public()
  @Get()
  list() {
    return this.seasons.findAll();
  }

  @Public()
  @Get(':id')
  one(@Param('id') id: string) {
    return this.seasons.findOne(id);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @UseGuards(AdminGuard)
  @Post()
  create(@Body() dto: CreateSeasonDto) {
    return this.seasons.create(dto);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @UseGuards(AdminGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSeasonDto) {
    return this.seasons.update(id, dto);
  }
}
