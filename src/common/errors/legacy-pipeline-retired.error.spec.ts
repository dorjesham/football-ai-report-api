import { HttpStatus } from '@nestjs/common';
import {
  LEGACY_PIPELINE_RETIRED_CODE,
  throwLegacyPipelineRetired,
} from './legacy-pipeline-retired.error';

describe('throwLegacyPipelineRetired', () => {
  it('throws 410 with LEGACY_PIPELINE_RETIRED', () => {
    try {
      throwLegacyPipelineRetired();
      fail('expected throw');
    } catch (e) {
      const ex = e as { getStatus: () => number; getResponse: () => unknown };
      expect(ex.getStatus()).toBe(HttpStatus.GONE);
      expect(ex.getResponse()).toEqual(
        expect.objectContaining({
          errorCode: LEGACY_PIPELINE_RETIRED_CODE,
        }),
      );
    }
  });
});
