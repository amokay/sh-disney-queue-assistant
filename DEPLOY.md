# GitHub Pages 部署指南

## 📋 部署前检查清单

### 1. 确保frontend目录是最新的
所有前端开发在 `frontend/` 目录下进行,包括:
- HTML文件 (index_babylon.html, phone-frame.html等)
- CSS文件 (src/styles-planner.css)
- JavaScript文件 (src/main_new.js, src/config.js等)
- 3D场景文件 (src/scene3d/)
- 资源文件 (assets/)

### 2. 同步文件到根目录
执行以下命令将frontend的文件同步到根目录(用于GitHub Pages):

```bash
bash deploy-gh-pages.sh
```

或手动执行:
```bash
# 同步HTML
cp -f frontend/index_babylon.html index_babylon.html
cp -f frontend/phone-frame.html phone-frame.html

# 同步CSS和JS
cp -f frontend/src/styles-planner.css src/styles-planner.css
cp -rf frontend/src/scene3d src/scene3d

# 同步资源
cp -rf frontend/assets assets
```

### 3. 提交并推送
```bash
git add -A
git commit -m "chore: 更新GitHub Pages部署"
git push origin gh-pages
```

### 4. 等待部署完成
GitHub Pages通常需要2-5分钟来重新构建和部署。

## 🔍 验证部署

访问以下地址验证:
- 主页: https://amokay.github.io/sh-disney-queue-assistant/
- 直接访问3D地图: https://amokay.github.io/sh-disney-queue-assistant/index_babylon.html

## ⚠️ 常见问题

### 问题1: 3D模型和贴图不显示
**原因**: 资源路径错误
**解决**: 
1. 确保所有fetch路径使用相对路径 `./assets/...`
2. 确保assets目录已同步到根目录
3. 清除浏览器缓存(Cmd+Shift+R)

### 问题2: 入口tabs没有隐藏
**原因**: phone-frame.html未更新
**解决**: 
1. 确保frontend/phone-frame.html中 `.mode-tabs` 设置为 `display: none`
2. 同步到根目录: `cp -f frontend/phone-frame.html phone-frame.html`
3. 重新部署

### 问题3: 样式不生效
**原因**: CSS文件未同步
**解决**:
1. 确保frontend/src/styles-planner.css是最新版本
2. 同步到根目录: `cp -f frontend/src/styles-planner.css src/styles-planner.css`
3. 清除浏览器缓存

## 🎯 最佳实践

1. **始终在frontend目录开发** - 这是源代码目录
2. **部署前运行deploy-gh-pages.sh** - 自动同步所有文件
3. **使用相对路径** - 所有资源引用使用 `./` 开头
4. **测试后再部署** - 先在本地测试(http://localhost:3000)
5. **清除缓存** - 部署后强制刷新浏览器

## 📝 自动化部署建议

可以配置GitHub Actions实现自动部署:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Sync files
        run: bash deploy-gh-pages.sh
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./
```
