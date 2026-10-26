# 安装说明

Code ICU 是一个纯前端应用，没有服务端、没有账号、没有数据库。四种用法按省事程度从高到低排，任选其一即可。

---

## 方式一 · 在线版（零安装）

打开 <https://gztcode.github.io/code-icu/> 就能用。

- 手机、电脑都支持，移动端优先适配
- 数据实时来自 GitHub 公开 API
- 断网时会降级到内置快照，页面会明确标注「演示数据」

不想装任何东西的话，到这里就够了。

---

## 方式二 · 装成桌面应用（PWA）

站点是 PWA（渐进式 Web 应用），可以装成独立窗口的应用。

### Chrome / Edge（Windows / macOS / Linux）

1. 用 Chrome 或 Edge 打开 <https://gztcode.github.io/code-icu/>
2. 点地址栏右侧的「安装」图标（一个带下箭头的显示器图标）
   - 没看到图标？点地址栏右侧的 ⋮ 菜单 →「投放、保存和共享」→「安装页面为应用」
3. 确认后完成。桌面（或开始菜单）会出现一个 Code ICU 图标

### macOS Safari

1. 打开站点 → 底部「分享」按钮
2. 选「添加到程序坞」→ 命名 → 「添加」

### iOS / iPadOS Safari

1. 打开站点 → 底部「分享」按钮
2. 选「添加到主屏幕」→ 「添加」

### 装好之后有什么不同

| | 在线版 | 桌面应用 |
|---|---|---|
| 独立窗口、没有地址栏 | ✗ | ✓ |
| 桌面/开始菜单有图标 | ✗ | ✓ |
| 断网能打开 | ✗（降级到快照） | ✓（Service Worker 缓存全站资源） |
| 更新 | 刷新即最新 | 下次启动自动更新 |

> 装完如果想卸载：Chrome/Edge 里在应用窗口的 ⋮ 菜单选「卸载」；macOS 从程序坞拖到废纸篓；iOS 长按图标删除。

---

## 方式三 · 下载桌面包（离线可跑）

去 <https://github.com/gztcode/code-icu/releases> 下载对应系统的压缩包。

| 包 | 适用系统 | 启动方式 |
|---|---|---|
| `code-icu-<版本>-macos.zip` | macOS | 解压后双击 `start.command` |
| `code-icu-<版本>-windows.zip` | Windows | 解压后双击 `start.bat` |
| `code-icu-<版本>-linux.zip` | Linux | 解压后运行 `bash start.sh` |
| `code-icu-<版本>-web.zip` | 任意 | 纯站点文件，扔进任意静态服务器 |
| `code-icu-<版本>-source.zip` | 任意 | 完整源码 |

### 使用步骤

1. 下载并解压到任意目录
2. 双击启动脚本（Linux 用 `bash start.sh`）
3. 浏览器自动打开 `http://127.0.0.1:8765/`
   - 没自动打开就手动在地址栏输入这个地址
4. 用完关掉命令行 / Terminal 窗口，服务即停止

### 需要什么

- **一个现代浏览器**：Chrome / Edge / Safari / Firefox，需支持 ES Module（2018 年之后的版本）
- **Node.js 或 Python 3 任一个**：启动脚本会自动挑可用的（优先 Node.js，没有就用 Python 3）

两者都没有的话，直接用方式一，功能完全一样。

### 为什么不能直接双击 index.html

页面用原生 ES Module 加载 30+ 个 JS 文件。Chrome / Safari 在 `file://` 协议下会以 CORS 为由拒绝加载模块脚本（此时 origin 为 `null`），页面直接白屏。

所以必须起一个本地 HTTP 服务 —— 启动脚本已经替你做了。

### 端口被占用

启动脚本默认用 8765 端口。报「端口已被占用」的话，把脚本里的 `PORT=8765` 改成别的数字（如 8080），保存后重新运行。

也可以直接手动指定端口：

```bash
node server.mjs 8080        # Node 版
python3 serve.py 8080 code-icu   # Python 版
```

### 校验下载完整性

每个 Release 都附了 SHA-256。核对一下：

```bash
shasum -a 256 code-icu-1.0.0-macos.zip     # macOS / Linux
certutil -hashfile code-icu-1.0.0-macos.zip SHA256   # Windows
```

跟 Release 页面上的值比对即可。

### 包里有什么

```
code-icu-1.0.0-macos/
├── code-icu/        网站文件本体：index.html、css/、js/、icons/ …
├── server.mjs       零依赖本地静态服务器（Node.js 版）
├── serve.py         零依赖本地静态服务器（Python 3 版）
├── start.command    启动脚本
├── LICENSE          MIT 许可证全文
└── README.txt       快速上手说明
```

---

## 方式四 · 从源码运行（开发）

需要 Node.js 18+。

```bash
git clone https://github.com/gztcode/code-icu.git
cd code-icu

npm install     # 运行时零依赖，这一步只装测试用的 Playwright
npm start       # → http://127.0.0.1:8080
```

常用脚本：

```bash
npm test           # 五套回归测试
npm run test:online   # 打线上地址做端到端冒烟
npm run icons      # 重新生成 PWA 图标
npm run pack       # 打包三平台发行包到 dist/
node tests/package-smoke.mjs   # 解压发行包后做离线冒烟
```

### 本地起服务的一个坑

**请用 `npm start`（`node tests/serve.mjs`），不要用 `python3 -m http.server`。**

`http.server` 继承 `socketserver.TCPServer`，监听队列长度只有 5；而本页一进来就要并行拉 30+ 个 ES Module，队列溢出会让内核直接 RST 掉排在后面的连接，浏览器表现为「随机一个模块 `ERR_CONNECTION_RESET`」，页面白屏且时好时坏。

实测同一台机器、同一份代码，连续加载 12 次：

| 服务器 | 渲染失败 | 请求失败 |
|---|---|---|
| `python3 -m http.server`（队列 5） | **6 / 12** | 6 |
| `serve.py`（队列 128 + 线程） | **0 / 12** | 0 |

发行包内置的 `serve.py` 已经修好了这个问题，所以没装 Node.js 的用户用 Python 兜底也不会白屏。

---

## 数据与隐私

- 所有体检数据来自 GitHub 公开 REST API，**由你的浏览器直接请求** `api.github.com`
- 不上传任何数据，不经过任何中间服务器，没有埋点
- 你填的 GitHub Token 只保存在本机浏览器的 `localStorage`，仅用于给 `api.github.com` 请求加认证头
- 限流规则：匿名 60 次/小时，填了 Token 是 5000 次/小时

---

## 常见问题

**Q：打开是空白页？**
A：先确认不是直接双击了 `index.html`。必须走启动脚本或在线版。若已用启动脚本仍白屏，试试在启动脚本里换端口。

**Q：启动脚本说找不到 Node.js 和 Python？**
A：装 Node.js（<https://nodejs.org/>）后重试；或直接用在线版。

**Q：macOS 双击 `start.command` 提示「无法打开，因为来自身份不明的开发者」？**
A：右键点击该文件 →「打开」→ 确认打开。或在「系统设置 → 隐私与安全性」里点「仍要打开」。

**Q：Windows 双击 `start.bat` 窗口一闪就没了？**
A：说明 Node.js 和 Python 都没找到。装其中一个，或在已安装的终端里手动运行 `node server.mjs` 看报错。

**Q：体检结果和网页上显示的不一样？**
A：正常。网页版读的是实时 API 数据，页面顶部会标注数据来源；匿名 API 有限流（60 次/小时），超了会自动降级到内置快照并标注「演示数据」。填 Token 可提到 5000 次/小时。

**Q：能离线体检吗？**
A：桌面应用与发行包支持离线打开页面，但体检数据需要联网向 GitHub API 实时获取（离线时展示的是内置快照）。

---

## 许可证

[MIT](../LICENSE) © 2026 gztcode。算法完全公开，欢迎查看源码复核。
