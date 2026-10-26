/**
 * 打包三平台可直接运行的发行包。
 *
 * 产出（全部落在 dist/）：
 *   code-icu-<v>-macos.zip     含 start.command（双击即用）
 *   code-icu-<v>-windows.zip   含 start.bat
 *   code-icu-<v>-linux.zip     含 start.sh
 *   code-icu-<v>-web.zip       纯站点文件，无脚本
 *   code-icu-<v>-source.zip    完整源码
 *
 * 确定性：所有文件的 mtime 统一为 SOURCE_DATE_EPOCH（默认取最新 commit 的时间），
 * 同一份代码重复打包得到字节一致的 zip，Release 里覆盖上传不会产生无意义 diff。
 *
 * 用法：node tools/pack-release.mjs
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;

/** 三个平台的启动脚本与说明文案 */
const PLATFORMS = [
  { key: 'macos', launcher: 'start.command', exec: true, how: '双击 start.command' },
  { key: 'windows', launcher: 'start.bat', exec: false, how: '双击 start.bat' },
  { key: 'linux', launcher: 'start.sh', exec: true, how: '运行 start.sh（bash start.sh）' },
];

/** 统一 mtime，保证打包结果可复现 */
const epoch = process.env.SOURCE_DATE_EPOCH
  ? Number(process.env.SOURCE_DATE_EPOCH)
  : Number(execFileSync('git', ['log', '-1', '--format=%ct'], { cwd: ROOT, encoding: 'utf8' }).trim());
const MTIME = new Date(epoch * 1000);

function touchTree(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) touchTree(full);
    else utimesSync(full, MTIME, MTIME);
  }
}

function zip(dirName, zipName) {
  // -r 递归 -X 去掉额外属性 -q 安静
  execFileSync('zip', ['-r', '-X', '-q', zipName, dirName], { cwd: DIST });
  const buf = readFileSync(join(DIST, zipName));
  return {
    name: zipName,
    size: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
  };
}

/** 递归复制，跳过不该进包的东西 */
function copySrc(dest) {
  cpSync(join(ROOT, 'src'), dest, {
    recursive: true,
    filter: (src) => !['.DS_Store', 'node_modules', '.git'].includes(src.split('/').pop()),
  });
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const artifacts = [];

/* ---------------- 1. 三平台桌面包 ---------------- */
for (const p of PLATFORMS) {
  const dirName = `code-icu-${VERSION}-${p.key}`;
  const dir = join(DIST, dirName);
  mkdirSync(dir, { recursive: true });

  copySrc(join(dir, 'code-icu'));
  cpSync(join(ROOT, 'tools/server.mjs'), join(dir, 'server.mjs'));
  cpSync(join(ROOT, 'tools/launcher/serve.py'), join(dir, 'serve.py'));
  cpSync(join(ROOT, 'tools/launcher', p.launcher), join(dir, p.launcher));
  cpSync(join(ROOT, 'LICENSE'), join(dir, 'LICENSE'));

  const readme = readFileSync(join(ROOT, 'tools/launcher/README.txt'), 'utf8')
    .replaceAll('{{VERSION}}', VERSION)
    .replaceAll('{{LAUNCHER}}', p.launcher);
  writeFileSync(join(dir, 'README.txt'), readme);

  if (p.exec) {
    execFileSync('chmod', ['+x', join(dir, p.launcher)]);
  }

  touchTree(dir);
  artifacts.push(zip(dirName, `${dirName}.zip`));
  console.log(`  ✓ ${dirName}.zip  （${p.how}）`);
}

/* ---------------- 2. 纯站点包 ---------------- */
{
  const dirName = `code-icu-${VERSION}-web`;
  const dir = join(DIST, dirName);
  mkdirSync(dir, { recursive: true });
  copySrc(dir);
  cpSync(join(ROOT, 'LICENSE'), join(dir, 'LICENSE'));
  touchTree(dir);
  artifacts.push(zip(dirName, `${dirName}.zip`));
  console.log(`  ✓ ${dirName}.zip  （纯站点文件）`);
}

/* ---------------- 3. 源码包 ---------------- */
{
  const dirName = `code-icu-${VERSION}-source`;
  const dir = join(DIST, dirName);
  mkdirSync(dir, { recursive: true });

  /** 设计过程截图与测试截图不进包（十几 MB，且不是源码） */
  const EXCLUDE = /(^|[\\/])(shots|\.cache|node_modules|dist|\.git|\.workbuddy)([\\/]|$)/;

  const filter = (src) => {
    const rel = src.slice(ROOT.length + 1);
    if (EXCLUDE.test(rel)) return false;
    return !rel.split(/[\\/]/).pop().startsWith('.DS_Store');
  };

  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', '.workbuddy'].includes(entry.name)) continue;
    cpSync(join(ROOT, entry.name), join(dir, entry.name), { recursive: true, filter });
  }
  touchTree(dir);
  artifacts.push(zip(dirName, `${dirName}.zip`));
  console.log(`  ✓ ${dirName}.zip  （完整源码）`);
}

/* ---------------- 4. 清单 ---------------- */
const manifest = {
  name: pkg.name,
  version: VERSION,
  license: pkg.license,
  homepage: pkg.homepage,
  repository: pkg.repository?.url,
  builtAt: new Date(MTIME).toISOString(),
  artifacts: artifacts.map((a) => ({ name: a.name, size: a.size, sha256: a.sha256 })),
};
writeFileSync(join(DIST, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\n版本 ${VERSION} · ${artifacts.length} 个包 → dist/`);
for (const a of artifacts) {
  console.log(`  ${a.name.padEnd(34)} ${(a.size / 1024).toFixed(0).padStart(5)} KB  ${a.sha256.slice(0, 12)}`);
}
