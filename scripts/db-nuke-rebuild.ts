/**
 * 危险操作：清空数据库并重新 migrate + seed。
 * 用法：CONFIRM_DB_NUKE=yes npm run db:nuke-rebuild
 * 或交互：npm run db:nuke-rebuild（输入 YES）
 */
import { execSync } from 'child_process';
import * as readline from 'readline';

const root = process.cwd();

async function promptIfNeeded(): Promise<void> {
  if (process.env.CONFIRM_DB_NUKE === 'yes') return;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  await new Promise<void>((resolve, reject) => {
    rl.question(
      'Type YES to destroy ALL data and rebuild schema + seed: ',
      (line) => {
        rl.close();
        if (line.trim() !== 'YES') {
          reject(new Error('Aborted'));
          return;
        }
        resolve();
      },
    );
  });
}

async function main() {
  await promptIfNeeded();
  console.log('Running prisma migrate reset --force ...');
  execSync('npx prisma migrate reset --force', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env },
  });
  console.log('Database nuked and re-seeded.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
