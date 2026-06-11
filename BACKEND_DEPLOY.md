# 后端API部署指南 - 获取真实排队时间

## 🎯 目标

让GitHub Pages上的前端能够访问真实的排队时间数据,而不是静态JSON。

## 📋 部署步骤

### 方案1: 部署到Vercel (推荐)

#### 第1步: 登录Vercel
```bash
cd /Users/wangmingyu/Desktop/project/sh-disney-gh-pages/backend
vercel login
```

#### 第2步: 初始化项目
```bash
vercel
```
按提示操作:
- Link to existing project? **No**
- What's your project's name? **sh-disney-backend**
- Which directory is your code in? **.**
- Want to override the settings? **No**

#### 第3步: 配置环境变量
在Vercel控制台添加以下环境变量:
- `THEMEPARKS_API_KEY` - 主题公园API密钥(如果需要)
- `AMAP_KEY` - 高德地图API密钥
- 其他在 `.env.example` 中列出的变量

#### 第4步: 部署生产环境
```bash
vercel --prod
```

部署成功后会显示URL,例如:
```
https://sh-disney-backend.vercel.app
```

#### 第5步: 配置前端API地址
编辑 `src/api/config.js`:
```javascript
export const PRODUCTION_API_BASE = "https://sh-disney-backend.vercel.app";
export const USE_PRODUCTION_API = true;
```

#### 第6步: 重新部署前端
```bash
cd ..
bash deploy-gh-pages.sh
# 或
vercel --prod
```

---

### 方案2: 部署到Railway

#### 第1步: 创建Railway账号
访问 https://railway.app 并注册

#### 第2步: 连接GitHub仓库
- 点击 "New Project"
- 选择 "Deploy from GitHub repo"
- 选择 `sh-disney-queue-assistant` 仓库
- 选择 `backend` 目录

#### 第3步: 配置环境变量
在Railway控制台的 "Variables" 标签页添加所有必要的环境变量

#### 第4步: 获取API地址
部署成功后,Railway会提供一个URL,例如:
```
https://sh-disney-backend.railway.app
```

#### 第5步: 配置前端
同方案1的第5步

---

### 方案3: 部署到Render

#### 第1步: 创建Render账号
访问 https://render.com 并注册

#### 第2步: 创建Web Service
- 点击 "New +"
- 选择 "Web Service"
- 连接GitHub仓库
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `node server.js`

#### 第3步: 配置环境变量
添加所有必要的环境变量

#### 第4步: 获取API地址
部署成功后会获得一个URL

#### 第5步: 配置前端
同方案1的第5步

---

## 🔍 验证部署

### 测试后端API
```bash
curl https://your-backend-url.vercel.app/api/waittimes
```

应该返回JSON格式的排队时间数据。

### 测试前端
1. 访问 GitHub Pages: https://amokay.github.io/sh-disney-queue-assistant/
2. 打开浏览器控制台(F12)
3. 查看Network标签,确认API请求成功
4. 检查排队时间是否为实时数据

---

## ⚠️ 常见问题

### 问题1: API返回404
**原因**: 路由配置错误
**解决**: 检查vercel.json中的routes配置

### 问题2: 数据库连接失败
**原因**: Railway/Render使用临时文件系统
**解决**: 
- 使用外部数据库(PostgreSQL/MongoDB)
- 或使用Vercel Postgres

### 问题3: CORS错误
**原因**: 跨域请求被阻止
**解决**: 确保server.js中启用了CORS
```javascript
app.use(cors());
```

### 问题4: 环境变量未生效
**原因**: 未在部署平台配置
**解决**: 在Vercel/Railway/Render控制台添加所有必需的环境变量

---

## 💡 最佳实践

1. **使用Vercel** - 最简单,与GitHub集成最好
2. **配置CI/CD** - 自动部署,推送代码即更新
3. **监控日志** - 定期检查后端日志,确保正常运行
4. **备份数据** - 定期导出SQLite数据库
5. **设置告警** - 当API不可用时收到通知

---

## 🚀 快速开始(使用Vercel)

```bash
# 1. 进入backend目录
cd backend

# 2. 登录Vercel
vercel login

# 3. 部署
vercel --prod

# 4. 复制返回的URL,例如: https://xxx.vercel.app

# 5. 修改前端配置
cd ..
# 编辑 src/api/config.js,填入你的URL
# export const PRODUCTION_API_BASE = "https://xxx.vercel.app";
# export const USE_PRODUCTION_API = true;

# 6. 重新部署前端
bash deploy-gh-pages.sh
```

完成!现在GitHub Pages将显示真实的排队时间数据! 🎉
