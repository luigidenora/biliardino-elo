import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const packageJsonPath = path.join(rootDir, 'package.json');
const swPath = path.join(rootDir, 'public', 'sw.js');

function parseVersion(version) {
  const [core] = String(version || '0.0.0').split('-');
  const parts = core.split('.').map(part => Number(part));
  const major = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  const patch = Number.isFinite(parts[2]) ? parts[2] : 0;
  return { major, minor, patch };
}

function getBuildId() {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (commitSha) return commitSha.slice(0, 8);

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

function getAutoPatchIncrement() {
  const githubRunNumber = Number(process.env.GITHUB_RUN_NUMBER || 0);
  if (Number.isFinite(githubRunNumber) && githubRunNumber > 0) {
    return Math.floor(githubRunNumber);
  }

  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (commitSha) {
    const numeric = Number.parseInt(commitSha.slice(0, 8), 16);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric % 100000;
    }
  }

  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return Number(`${yy}${mm}${dd}${hh}${mi}`);
}

async function main() {
  const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonRaw);

  const { major, minor, patch } = parseVersion(packageJson.version);
  const patchIncrement = getAutoPatchIncrement();

  const swCoreVersion = `${major}.${minor}.${patch + patchIncrement}`;
  const buildId = getBuildId();
  const swVersion = `${swCoreVersion}+${buildId}`;

  const swContent = await readFile(swPath, 'utf8');
  const updated = swContent.replace(
    /^const VERSION = '[^']*';/m,
    `const VERSION = '${swVersion}';`
  );
  await writeFile(swPath, updated, 'utf8');

  console.log(`[sw-version] ${swVersion}`);
}

main().catch((error) => {
  console.error('[sw-version] generation failed:', error);
  process.exitCode = 1;
});
