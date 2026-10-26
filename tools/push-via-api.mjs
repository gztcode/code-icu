/**
 * 通过 GitHub Git Database API 推送仓库（本机网络的绕行方案）。
 *
 * 背景：本机到 github.com:443 被代理拦截（CONNECT tunnel failed 502），
 *      但 api.github.com 可达。因此不走 git 协议，而是用 REST API 复刻一次 push：
 *      建 blob → 建 tree → 建 commit → 更新 ref。
 *
 * GitHub 不允许在空仓库直接建 blob，所以先用 Contents API 上传 README.md
 * 触发初始提交，仓库不再为空后再批量推送。
 *
 * 用法：
 *   node tools/push-via-api.mjs                      # 推送当前仓库到默认远端
 *   node tools/push-via-api.mjs <repo-dir> <owner/repo>
 *
 * 依赖：gh CLI 已登录且具备 repo scope（`gh auth status` 可见）。
 * 详见 docs/decisions/ADR-002.md。
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoDir = process.argv[2] || process.cwd();
const repoSlug =
  process.argv[3] ||
  execSync('git remote get-url origin', { cwd: repoDir, encoding: 'utf8' })
    .trim()
    .replace(/^git@[^:]+:/, '') // git@github.com:owner/repo.git
    .replace(/^https?:\/\/[^/]+\//, '') // https://github.com/owner/repo.git
    .replace(/\.git$/, '');

const TOKEN = execSync('gh auth token', { encoding: 'utf8' }).trim();
const API = `https://api.github.com/repos/${repoSlug}`;
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'code-icu-deploy',
  'Content-Type': 'application/json',
};

async function api(path, method = 'GET', body) {
  const res = await fetch(API + path, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}\n${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

/** 简单并发池，避免一次性打满连接 */
async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

console.log(`目标仓库: ${repoSlug}`);
console.log(`本地目录: ${repoDir}`);

// 0. 文件清单
const raw = execSync('git ls-files -z', { cwd: repoDir, encoding: 'utf8' });
const files = raw.split('\0').filter(Boolean);
console.log(`待推送文件: ${files.length}`);

// 1. 空仓库 → 用 Contents API 上传 README 触发初始提交
try {
  await api('/git/refs/heads/main', 'GET');
} catch {
  const readme = readFileSync(join(repoDir, 'README.md')).toString('base64');
  const seed = await api('/contents/README.md', 'PUT', {
    message: 'chore: 初始化仓库（README）',
    content: readme,
    branch: 'main',
  });
  console.log(`初始提交已创建: ${seed.commit.sha}`);
}
const ref = await api('/git/refs/heads/main', 'GET');
const parent = ref.object.sha;

// 2. 建 blob（代理链路偶发 400/502，重试三次）
let done = 0;
const entries = await pool(files, 10, async (path) => {
  const content = readFileSync(join(repoDir, path)).toString('base64');
  let blob;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      blob = await api('/git/blobs', 'POST', { content, encoding: 'base64' });
      break;
    } catch (err) {
      if (attempt === 3) throw new Error(`[${path}] ${err.message}`);
      console.log(`  重试 ${attempt}/3 ${path}: ${err.message.split('\n')[0]}`);
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  done++;
  if (done % 30 === 0 || done === files.length) console.log(`  blob ${done}/${files.length}`);
  return { path, mode: '100644', type: 'blob', sha: blob.sha };
});

// 3. 建 tree（以当前 main 为基线，未变更的文件自动保留）
const tree = await api('/git/trees', 'POST', { base_tree: parent, tree: entries });
console.log(`tree sha: ${tree.sha}`);

// 4. 建 commit
const message = execSync('git log -1 --pretty=%B', { cwd: repoDir, encoding: 'utf8' }).trim();
const commit = await api('/git/commits', 'POST', {
  message,
  tree: tree.sha,
  parents: [parent],
});
console.log(`commit sha: ${commit.sha}`);

// 5. 更新 ref
const updated = await api('/git/refs/heads/main', 'PATCH', { sha: commit.sha, force: true });
console.log(`ref: ${updated.ref} -> ${updated.object.sha}`);
console.log('推送完成');
