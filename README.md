# disney-map（全栈框架）

本项目分为 **浏览器 → 前端（HTML + Three.js + UI）→ 后端 API（Node.js + Express）→ SQLite → 外部数据源（等待时间 mock / 未来可接爬虫）**。

## 目录结构（概要）

- `frontend/`：页面、Three.js 场景、UI 组件、静态资源 `frontend/assets/`
- `backend/`：Express API、SQLite、定时任务
- `tools/`：本地资源压缩脚本（不上服务器）

## 启动步骤（推荐：同源访问，避免跨域）

1. **安装并启动后端**

```bash
cd backend
npm install
npm start
```

看到控制台输出：`服务器运行在 http://localhost:3000`

后端会：

- 初始化 SQLite（`backend/db/disney.db`）
- 启动定时任务（默认每 5 分钟 mock 更新等待时间）
- **托管 `frontend/` 静态文件**：直接用浏览器打开 `http://localhost:3000`

2. **打开页面**

在浏览器访问：`http://localhost:3000`

此时前端 `frontend/src/api/*.js` 里的 `API_BASE = ''`（空字符串）表示 **同域调用** `/api/...`，无需改配置。

## 百度步行路线（可选，与高德并存）

路线面板里的 **「步行连线」** 会走后端调用的 [百度步行路线规划](https://lbsyun.baidu.com/faq/api?title=webapi/webservice-direction/walking)，起终点使用库内景点的 **GCJ-02**（`coord_type=gcj02`、`ret_coordtype=gcj02`），与高德 POI 写入的 `gcj_lat` / `gcj_lng` 一致，无需 BD-09 转换。

1. 在 [百度地图开放平台](https://lbsyun.baidu.com/apiconsole/key) 创建应用并申请 **服务端** 类型的 AK（或按控制台说明使用可调用 WebService 的密钥）。
2. 在 `backend/.env` 或仓库根 `.env` 写入：`BAIDU_MAP_AK=你的AK`（也支持别名 `BAIDU_AK`）。
3. 重启后端；路线面板里选至少 2 个景点后点 **「步行连线」**（走百度路径规划）。

**若提示「APP 服务被禁用」或接口 `status` 为 240**：到 [百度地图开放平台](https://lbsyun.baidu.com/apiconsole/key) → **应用管理** → 确认应用为 **启用**（非禁用）；进入应用 → **「启用产品」/ 服务列表** 里勾选 **路线规划（含步行）相关的 Web 服务 API**；AK 须与本项目调用方式一致——请求从 **Node 服务端** 发出，应使用 **「服务端」** 类型 AK，并正确配置 **IP 白名单**（本地开发需填你当前网络的**公网出口 IP**，或按控制台允许的规则填写；仅填 Referer 无法解决服务端调用）。保存后等待几分钟再重试。

**关于「Referer 白名单」**：该限制主要针对在 **浏览器里** 直接请求百度 JS API / 部分需校验来源的接口。**本项目的百度请求由 Node 后端 `fetch` 发出**，通常 **没有浏览器 Referer**，因此请不要只依赖 Referer 白名单；应在控制台为该 AK 勾选 **「服务端」** 或配置 **服务器出口 IP 白名单**（本地开发可把本机公网 IP 或 `0.0.0.0/0` 按平台规则配置，以控制台为准）。若你改为 **前端页面直连** 百度接口，再把 Referer 配成你的页面来源，例如 `http://localhost:3000/*`、`https://你的域名/*`。

接口：`POST /api/route/baidu-walk`（body 与高德相同：`{ "attractions": ["id1","id2",...] }`），备用路径 `POST /api/baidu/scene-walk-polyline`。

## 可选：VS Code Live Server（5500）

若你坚持用 Live Server 打开 `frontend/index.html`（端口通常是 `5500`），由于端口不同，`API_BASE = ''` 会请求到 `5500` 而不是 `3000`。

任选其一：

- 把 `frontend/src/api/base.js` 里的 `API_BASE` 改为 `http://localhost:3000`（与 attractions / route / amap / baidu 共用）
- 或直接使用上面的 **`http://localhost:3000`** 方式（推荐）

## 开发模式（后端）

```bash
cd backend
npm run dev
```

与 `npm start` 相同：直接跑 `node server.js`（稳定）。若需要改代码自动重启，可用 `npm run dev:watch`（基于 `node --watch`）；在 macOS 上若出现 `EMFILE: too many open files`，可在终端先执行 `ulimit -n 10240` 再运行，或继续用不带 watch 的 `npm run dev`。

## 工具脚本权限

```bash
chmod +x tools/optimize_glb.sh tools/compress_textures.sh
```

详见 `tools/README.md`。





disney-map/
│
├── frontend/                          ← 所有前端代码
│   ├── index.html
│   ├── src/
│   │   ├── main.js
│   │   ├── scene.js
│   │   ├── camera.js
│   │   ├── loader.js
│   │   ├── instances.js
│   │   ├── interaction.js
│   │   ├── config.js 
│   │   │
│   │   ├── ui/                        ← UI 组件拆开管理
│   │   │   ├── panel.js               ← 左侧景点列表面板
│   │   │   ├── detail.js              ← 点击建筑后的详情卡片
│   │   │   ├── route.js               ← 路线规划面板
│   │   │   ├── loading.js             ← 加载进度遮罩
│   │   │   └── toast.js               ← 轻提示（加入路线成功等）
│   │   │
│   │   └── api/                       ← 前端调用后端的封装
│   │       ├── attractions.js          ← 获取景点/等待时间
│   │       └── route.js               ← 路线规划请求
│   │
│   └── assets/
│       ├── models/
│       │   ├── source/                ← 原始 Blender 文件，不上服务器
│       │   └── optimized/
│       │       ├── overview/
│       │       │   └── park_overview.glb
│       │       ├── zones/
│       │       │   ├── ground.glb
│       │       │   ├── zone_fantasyland.glb
│       │       │   ├── zone_tomorrowland.glb
│       │       │   ├── zone_adventureland.glb
│       │       │   └── zone_treasurecove.glb
│       │       ├── landmarks/
│       │       │   ├── castle_LOD0.glb
│       │       │   ├── castle_LOD1.glb
│       │       │   ├── tron_LOD0.glb
│       │       │   └── soaring_LOD0.glb
│       │       └── props/
│       │           ├── tree_01.glb
│       │           ├── tree_02.glb
│       │           └── lamp_01.glb
│       ├── textures/
│       │   ├── source/                ← 原始贴图，不上服务器
│       │   └── optimized/             ← WebP 压缩后
│       └── icons/                     ← UI 用到的图标
│           ├── marker.svg
│           └── arrow.svg
│
├── backend/                           ← 所有后端代码
│   ├── server.js                      ← 入口，启动 Express
│   ├── package.json
│   │
│   ├── routes/                        ← API 路由
│   │   ├── attractions.js             ← GET /api/attractions
│   │   ├── waittimes.js               ← GET /api/waittimes
│   │   └── route.js                   ← POST /api/route/plan、amap-walk、baidu-walk
│   │
│   ├── controllers/                   ← 路由对应的处理逻辑
│   │   ├── attractionsController.js
│   │   ├── waittimesController.js
│   │   └── routeController.js
│   │
│   ├── services/                      ← 核心业务逻辑
│   │   ├── waittimeService.js         ← 获取/缓存等待时间数据
│   │   ├── routeService.js            ← 路线规划算法
│   │   └── scraperService.js          ← 定时爬取等待时间
│   │
│   ├── models/                        ← 数据库模型定义
│   │   ├── Attraction.js              ← 景点表
│   │   └── WaitTime.js                ← 等待时间记录表
│   │
│   ├── db/
│   │   ├── connection.js              ← 数据库连接
│   │   └── seed.js                    ← 初始化景点基础数据
│   │
│   └── config/
│       └── index.js                   ← 后端配置（端口、数据库地址等）
│
├── tools/                             ← 本地工具脚本，不上服务器
│   ├── optimize_glb.sh
│   ├── compress_textures.sh
│   └── README.md
│
├── .gitignore
└── README.md

