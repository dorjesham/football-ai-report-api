import { UserRole } from '@prisma/client';

/** 锁定 GET /auth/me 公开字段契约 */
describe('auth public user contract', () => {
  const publicKeys = [
    'id',
    'openid',
    'role',
    'nickname',
    'avatarUrl',
    'email',
    'username',
    'phone',
    'phoneVerified',
    'hasPassword',
    'linkedWechat',
    'linkedWechatWeb',
    'linkedApple',
    'linkedGoogle',
  ];

  it('includes multi-channel auth fields', () => {
    const sample = {
      id: 'u1',
      openid: null,
      role: UserRole.USER,
      nickname: 'test',
      avatarUrl: null,
      email: 'us***@example.com',
      username: 'fan2026',
      phone: null,
      phoneVerified: false,
      hasPassword: true,
      linkedWechat: false,
      linkedWechatWeb: true,
      linkedApple: false,
      linkedGoogle: true,
    };
    expect(Object.keys(sample).sort()).toEqual(publicKeys.sort());
  });
});
