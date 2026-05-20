import { HttpException, HttpStatus } from '@nestjs/common';

export const LEGACY_PIPELINE_RETIRED_CODE = 'LEGACY_PIPELINE_RETIRED';

export const LEGACY_PIPELINE_RETIRED_MESSAGE =
  'This pipeline has been retired. Use POST /admin/api/af/matches/:matchId/sync-full instead.';

export function throwLegacyPipelineRetired(): never {
  throw new HttpException(
    {
      success: false,
      errorCode: LEGACY_PIPELINE_RETIRED_CODE,
      message: LEGACY_PIPELINE_RETIRED_MESSAGE,
    },
    HttpStatus.GONE,
  );
}
