import { SetMetadata } from '@nestjs/common';
import { AdminConsoleRole } from '@prisma/client';

export const ADMIN_CONSOLE_ROLES_KEY = 'adminConsoleRoles';

/** 允许执行该路由的最低控制台角色集合（满足其一即可，SUPER_ADMIN 始终允许） */
export const RequireAdminConsoleRole = (...roles: AdminConsoleRole[]) =>
  SetMetadata(ADMIN_CONSOLE_ROLES_KEY, roles);
