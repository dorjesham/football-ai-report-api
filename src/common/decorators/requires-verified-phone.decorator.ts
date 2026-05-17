import { SetMetadata } from '@nestjs/common';

export const REQUIRES_VERIFIED_PHONE_KEY = 'requiresVerifiedPhone';

/** 需已验证手机（`AUTH_REQUIRE_VERIFIED_PHONE=true` 时生效） */
export const RequiresVerifiedPhone = () => SetMetadata(REQUIRES_VERIFIED_PHONE_KEY, true);
