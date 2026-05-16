import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSeasonDto } from './dto/create-season.dto';
import { UpdateSeasonDto } from './dto/update-season.dto';

@Injectable()
export class SeasonsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.season.findMany({ orderBy: { code: 'desc' } });
  }

  async findOne(id: string) {
    const s = await this.prisma.season.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Season not found');
    return s;
  }

  create(dto: CreateSeasonDto) {
    return this.prisma.season.create({ data: dto });
  }

  async update(id: string, dto: UpdateSeasonDto) {
    await this.findOne(id);
    return this.prisma.season.update({ where: { id }, data: dto });
  }
}
