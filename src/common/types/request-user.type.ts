import { UserRole } from '@prisma/client';

export type RequestUser = {
  id: string;
  /** 手机注册用户绑定微信前可能为空 */
  openid: string | null;
  role: UserRole;
};
