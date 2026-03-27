const { spawnSync } = require('child_process');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });

  if (typeof result.status === 'number') {
    return result.status;
  }

  if (result.error) {
    throw result.error;
  }

  return 1;
}

function exitOnFailure(step, status) {
  if (status !== 0) {
    console.error(`[render-build] ${step} failed with exit code ${status}.`);
    process.exit(status || 1);
  }
}

console.log('[render-build] Generating Prisma client...');
exitOnFailure('prisma generate', run('npx', ['prisma', 'generate']));

console.log('[render-build] Applying Prisma migrations...');
const migrateResult = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  shell: process.platform === 'win32',
  env: process.env,
});

if (migrateResult.stdout) process.stdout.write(migrateResult.stdout);
if (migrateResult.stderr) process.stderr.write(migrateResult.stderr);

const combinedOutput = `${migrateResult.stdout || ''}\n${migrateResult.stderr || ''}`;
if (migrateResult.status === 0) {
  console.log('[render-build] Prisma migrations applied successfully.');
  process.exit(0);
}

if (combinedOutput.includes('Error: P3005')) {
  console.warn('[render-build] Prisma reported P3005: the target database is already populated.');
  console.warn('[render-build] Continuing deploy without applying migrations on Render.');
  console.warn('[render-build] Baseline this database with Prisma later to restore strict migration tracking.');
  process.exit(0);
}

console.error(`[render-build] prisma migrate deploy failed with exit code ${migrateResult.status || 1}.`);
process.exit(migrateResult.status || 1);
