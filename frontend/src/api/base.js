import { PRODUCTION_API_BASE, USE_PRODUCTION_API } from "./config.js";

/**
 * 所有 `/api/*` 请求共用的前缀。
 *
 * - 若页面与后端同源（推荐：`http://localhost:3000` 打开），保持 `""` 即可。
 * - 若用 Live Server / 其它端口打开本地 HTML，自动指向本机 `:3000` 上的 Express。
 * - 线上前后端分离时，可改为显式域名，例如 `https://api.example.com`。
 */
function inferApiBase() {
  if (typeof window === "undefined" || !window.location) return "";
  const { hostname, port, protocol } = window.location;
  if (protocol === "file:") return "http://localhost:3000";
  const isLocal =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  
  // 生产环境且启用了生产 API
  if (!isLocal && USE_PRODUCTION_API && PRODUCTION_API_BASE) {
    return PRODUCTION_API_BASE;
  }
  
  if (!isLocal) return "";
  const effectivePort = port || (protocol === "https:" ? "443" : "80");
  if (effectivePort === "3000") return "";
  return `http://${hostname}:3000`;
}

export const API_BASE = inferApiBase();

/** 
 * 是否为纯静态托管（无后端 API）
 * GitHub Pages 和 Vercel 仍然尝试调用 API，失败后才降级到静态文件
 */
export const IS_STATIC_DEPLOY = (() => {
  if (typeof window === "undefined" || !window.location) return false;
  const h = window.location.hostname;
  // 仅阿里内部域名使用纯静态模式
  return h.endsWith(".alibaba-inc.com") || h.endsWith(".alipay.com");
})();
