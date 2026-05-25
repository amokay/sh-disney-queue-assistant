import "./loadEnv.js";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import { config } from "./config/index.js";
import { runSeed } from "./db/seed.js";
import { fetchAndStoreWaitTimes } from "./services/scraperService.js";
import attractionsRoutes from "./routes/attractions.js";
import waittimesRoutes from "./routes/waittimes.js";
import routeRoutes from "./routes/route.js";
import * as routeController from "./controllers/routeController.js";
import { handleGeoProject, handleGeoInverse, handleGeoReference } from "./routes/geo.js";
import amapApiRoutes from "./routes/amapApi.js";
import baiduApiRoutes from "./routes/baiduApi.js";
import { listOptimizedGlbUrls } from "./routes/discover.js";
import { syncModelTransformStubs } from "./services/syncModelTransformStubs.js";
import { syncGlbPoiBindings } from "./services/syncGlbPoiBindings.js";
import { llmConfigStatus } from "./services/llmClient.js";
import sessionRoutes from "./routes/session.js";
import plannerRoutes from "./routes/planner.js";
import { clearOverrides } from "./services/mockWaitService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(__dirname, "..", "frontend");

runSeed();

const app = express();

app.use(
  cors({
    origin: [
      config.CORS_ORIGIN,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:5500",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
  })
);
app.use(express.json());

/** 经纬度 ↔ 场景：必须在 express.static 之前显式注册，避免被静态资源 404 吞掉 */
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "disney-map-backend",
    geo: true,
    llm: llmConfigStatus(),
    walkRoute: process.env.WALK_ROUTE_PROVIDER || "baidu-then-amap",
  });
});
app.get("/api/geo/project", handleGeoProject);
app.get("/api/geo/inverse", handleGeoInverse);
app.get("/api/geo/reference", handleGeoReference);
app.get("/api/latlng-to-scene", handleGeoProject);
app.get("/api/geo-project", handleGeoProject);

app.use("/api/attractions", attractionsRoutes);
app.use("/api/waittimes", waittimesRoutes);
/** 与子路由重复注册：避免仅部分环境子 Router 未匹配时出现 POST 404 */
app.post("/api/route/amap-walk", routeController.postAmapWalkRoute);
app.post("/api/route/baidu-walk", routeController.postBaiduWalkRoute);
app.post("/api/route/smart-plan", routeController.postSmartPlanRoute);
app.use("/api/route", routeRoutes);
app.use("/api/session", sessionRoutes);
app.use("/api/planner", plannerRoutes);
app.use("/api/amap", amapApiRoutes);
app.use("/api/baidu", baiduApiRoutes);

// 直接在 app 上注册，避免子 Router 未匹配导致 404（两个路径任选其一访问）
app.get("/api/discover/glbs", (req, res) => {
  try {
    res.json({ urls: listOptimizedGlbUrls() });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/glb-list", (req, res) => {
  try {
    res.json({ urls: listOptimizedGlbUrls() });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.use(express.static(frontendDir));
// 将 node_modules/three 本地化挂载，避免依赖 CDN（支持离线访问）
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three')));

// 启动时立即获取一次真实排队数据
fetchAndStoreWaitTimes().then((r) => {
  console.log(`[startup] 排队数据初始化: source=${r.source}, count=${r.count}`);
});

// 每 5 分钟刷新真实排队数据；刷新时清空手动覆盖
cron.schedule("*/5 * * * *", async () => {
  clearOverrides();
  await fetchAndStoreWaitTimes();
});

const server = app.listen(config.PORT, () => {
  const n = listOptimizedGlbUrls().length;
  console.log(`服务器运行在 http://localhost:${config.PORT}（已扫描到 ${n} 个 .glb）`);
  console.log("健康检查: GET /api/health");
  console.log("经纬度→场景: /api/latlng-to-scene?lat=…&lng=…  或  /api/geo/project?lat=…&lng=…");
  if (process.env.SKIP_SYNC_TRANSFORM_STUBS !== "1") {
    try {
      const { added } = syncModelTransformStubs({ silent: true });
      if (added > 0) {
        console.log(
          `已为 ${added} 个尚未配置 match 的 .glb 在 model_transforms.json 追加占位规则（请编辑坐标/缩放）`
        );
      }
    } catch (e) {
      console.warn("[model_transforms] 占位规则同步失败（可稍后运行 npm run sync-transform-stubs）:", e?.message || e);
    }
  }
  if (process.env.SKIP_SYNC_GLB_POI !== "1" && (process.env.AMAP_WEB_KEY || process.env.AMAP_KEY)) {
    void syncGlbPoiBindings({
      silent: false,
      syncAttractionDb: process.env.SKIP_SYNC_GLB_POI_ATTRACTION_DB !== "1",
    })
      .then(({ updated, dbUpdated, errors }) => {
        if (updated > 0) {
          console.log(
            `[glb-poi] 启动时已按 glb_poi_bindings.json 更新 ${updated} 个模型位置` +
              (dbUpdated > 0 ? `，并同步 ${dbUpdated} 条景点库（蓝球 xz / gcj 与 POI 一致）` : "")
          );
        }
        if (errors.length) {
          console.warn("[glb-poi] 部分绑定同步失败:\n" + errors.map((e) => `  - ${e}`).join("\n"));
        }
      })
      .catch((e) => {
        console.warn("[glb-poi] 启动同步跳过:", e?.message || e);
      });
  }
  console.log("");
  console.log(
    ">>> 本进程会一直占用当前终端（正常情况，不是卡死）。请用浏览器打开上面的地址；需要停服时再按 Ctrl+C。"
  );
  console.log("");

});

server.on("error", (err) => {
  if (/** @type {NodeJS.ErrnoException} */ (err).code === "EADDRINUSE") {
    console.error(
      `[启动失败] 端口 ${config.PORT} 已被占用（EADDRINUSE）。请先关掉已占用的进程，例如在终端执行：lsof -i :${config.PORT}  找到 PID 后  kill <PID>`
    );
  } else {
    console.error("[启动失败]", err);
  }
  process.exit(1);
});
