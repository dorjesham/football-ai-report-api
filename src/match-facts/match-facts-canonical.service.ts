import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildValidationLogEntry } from './match-facts-quality.util';
import { parseSupplementaryFacts } from './supplementary-facts.util';

@Injectable()
export class MatchFactsCanonicalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Admin 确认：将 supplementary 中指定字段提升为 canonical（覆盖对应 JSON 列）。
   */
  async promoteSupplementary(
    matchId: string,
    sourceKey: string,
    fields: Array<'lineups' | 'events' | 'teamStats'>,
  ) {
    const facts = await this.prisma.matchFacts.findUnique({
      where: { matchId },
    });
    if (!facts) throw new NotFoundException('MatchFacts not found');

    const sup = parseSupplementaryFacts(facts.supplementaryFacts);
    const block = sup.sources[sourceKey];
    if (!block || typeof block !== 'object') {
      throw new BadRequestException(`supplementary 无来源 ${sourceKey}`);
    }
    const b = block as Record<string, unknown>;

    const data: Prisma.MatchFactsUpdateInput = {
      validatedAt: new Date(),
    };

    for (const f of fields) {
      if (f === 'lineups' && b.lineups != null) {
        data.lineups = b.lineups as Prisma.InputJsonValue;
      }
      if (f === 'events' && (b.events != null || b.eventsSample != null)) {
        data.events = (b.events ?? b.eventsSample) as Prisma.InputJsonValue;
      }
      if (f === 'teamStats' && b.teamStats != null) {
        data.teamStats = b.teamStats as Prisma.InputJsonValue;
      }
    }

    if (Object.keys(data).length <= 1) {
      throw new BadRequestException('无可提升字段（检查 supplementary 结构与 fields）');
    }

    const prev = Array.isArray(facts.validationLog)
      ? (facts.validationLog as unknown[])
      : facts.validationLog
        ? [facts.validationLog]
        : [];

    data.validationLog = [
      ...prev,
      buildValidationLogEntry([], {
        kind: 'SUPPLEMENTARY_PROMOTED_V1',
        sourceKey,
        fields,
      }),
    ] as Prisma.InputJsonValue;

    data.structureProvider = facts.structureProvider;

    return this.prisma.matchFacts.update({
      where: { matchId },
      data,
    });
  }
}
