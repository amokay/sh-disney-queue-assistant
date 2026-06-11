/**
 * 生产环境 API 配置
 * 
 * 当部署到 GitHub Pages 或 Vercel 等静态托管平台时,
 * 需要指定后端 API 的地址来获取真实数据。
 */

// TODO: 替换为你的后端 API 地址
// 例如: https://your-backend-api.vercel.app
// 部署后端后,将下面的地址改为实际的Vercel部署地址
export const PRODUCTION_API_BASE = "";

/**
 * 是否启用生产环境 API
 * 设置为 true 后,GitHub Pages/Vercel 将尝试从 PRODUCTION_API_BASE 获取数据
 * 
 * 注意: 需要先部署后端并填写上面的 PRODUCTION_API_BASE
 */
export const USE_PRODUCTION_API = false;
