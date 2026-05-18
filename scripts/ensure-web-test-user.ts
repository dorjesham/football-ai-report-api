/**
 * 创建/更新 Web 前端联调测试账号（邮箱+用户名+密码登录）
 * 用法：npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/ensure-web-test-user.ts
 */
import * as bcrypt from 'bcrypt';
import { PrismaClient, UserRole } from '@prisma/client';

const TEST_USERNAME = 'webtest';
const TEST_EMAIL = 'webtest@example.com';
const TEST_PASSWORD = 'WebTest@2026';
const BCRYPT_ROUNDS = 10;

async function main() {
  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

  const byUsername = await prisma.user.findUnique({ where: { username: TEST_USERNAME } });
  const byEmail = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });

  if (byUsername && byEmail && byUsername.id !== byEmail.id) {
    throw new Error('username and email belong to different users; resolve manually');
  }

  const existing = byUsername ?? byEmail;
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        username: TEST_USERNAME,
        email: TEST_EMAIL,
        passwordHash,
        nickname: 'Web测试账号',
        role: UserRole.USER,
      },
    });
    console.log(`Updated test user id=${existing.id}`);
  } else {
    const user = await prisma.user.create({
      data: {
        username: TEST_USERNAME,
        email: TEST_EMAIL,
        passwordHash,
        nickname: 'Web测试账号',
        role: UserRole.USER,
      },
    });
    console.log(`Created test user id=${user.id}`);
  }

  console.log('\n--- Web 前端测试账号 ---');
  console.log(`登录标识（二选一）: ${TEST_USERNAME} 或 ${TEST_EMAIL}`);
  console.log(`密码: ${TEST_PASSWORD}`);
  console.log(`接口: POST /auth/login  Body: { "identifier": "${TEST_USERNAME}", "password": "${TEST_PASSWORD}" }`);
  console.log('------------------------\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
