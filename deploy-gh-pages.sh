#!/bin/bash
# deploy-gh-pages.sh - 确保GitHub Pages部署正确的文件结构

set -e

echo "🚀 开始准备GitHub Pages部署..."

# 1. 确保frontend和根目录的文件同步
echo "📦 同步frontend目录到根目录..."

# 同步HTML文件
cp -f frontend/index_babylon.html index_babylon.html
cp -f frontend/index_pretrip.html index_pretrip.html
cp -f frontend/phone-frame.html phone-frame.html
cp -f frontend/index.html index.html

# 同步CSS文件
cp -f frontend/src/styles-planner.css src/styles-planner.css

# 同步JS文件
cp -f frontend/src/main_new.js src/main_new.js
cp -f frontend/src/config.js src/config.js
cp -f frontend/src/plannerApp.js src/plannerApp.js

# 同步scene3d目录
rm -rf src/scene3d
cp -rf frontend/src/scene3d src/scene3d

# 同步api目录
rm -rf src/api
cp -rf frontend/src/api src/api

# 同步ui目录
rm -rf src/ui
cp -rf frontend/src/ui src/ui

# 同步assets目录
echo "📁 同步assets资源文件..."
rm -rf assets
cp -rf frontend/assets assets

echo "✅ 文件同步完成"

# 2. 提交并推送
echo "💾 提交更改..."
git add -A
git commit -m "chore: 同步frontend文件到根目录用于GitHub Pages部署" || echo "没有新的更改需要提交"

echo "📤 推送到GitHub Pages..."
git push origin gh-pages

echo "✨ 部署完成!"
echo "🌐 访问地址: https://amokay.github.io/sh-disney-queue-assistant/"
