# scene3d 接口契约

> 框架层（main_new.js）与 3D 层（scene3d/）之间的通信规范。
> 两层开发者共同遵守此契约，确保独立开发、无冲突合并。

## 核心原则

1. **框架层不引用任何 Babylon 对象**（不 import BABYLON、不操作 mesh/scene）
2. **3D 层不监听业务事件**（不 addEventListener route-preview 等，由框架层调用接口转发）
3. **通信只走 SceneManager 实例方法**（同步调用 + 回调）

## SceneManager 接口一览

### 生命周期
```
new SceneManager(canvas, config)  // 构造
await init()                      // 初始化引擎/场景
dispose()                         // 销毁
```

### 相机
```
playIntro({ duration }) → Promise
resetCamera()
focusOnAttraction(id)
focusOnPoint(x, y, z, radius)
focusOnRoute(polyline, ordered)
focusTopDown(x, z, height)
focusOnLbsAndNext(lbsPoint, nextPoint)
```

### 模型加载
```
loadModels(manifest[]) → Promise
getLoadedAttractionIds() → Set<string>
getModelTopY(id) → number | null
getModelTopYMap() → Map<string, number>
```

### 标记 & 高亮
```
rebuildMarkers(attractions[], glbIds: Set)
setRouteHighlight(ids[] | null)
```

### 路线
```
setDenseWalkRoute(polyline, opts)
setRoutePreview(ordered)
clearRoute()
setParadeRoute(points)
setParadeVisible(boolean)
setParkRoads(roads)
```

### 用户位置
```
setUserPosition(x, z)
setUserTarget(x, z)
clearUserTarget()
hideUserMarker()
```

### 标签
```
rebuildWaitLabels(attractions, modelTopYMap)
focusLabel(id)
clearLabelFocus()
setLabelsVisible(boolean)
```

### 其他
```
setCarouselActive(boolean)
addTrees(positions[])
addPins(pins[])
resize()
```

### 事件回调（3D → 框架）
```
onAttractionClicked((id, hitPoint) => void)
onMapPinClicked((pinId, label, attractionId?) => void)
```

## 数据格式约定

### 坐标
所有 position 统一为 `{ x: number, y?: number, z: number }`（场景世界坐标）。

### 景点
```ts
{ id: string, name: string, position: { x, y?, z }, waitMinutes?: number }
```

### 路线折线
```ts
Array<{ x: number, y?: number, z: number }>
```

### manifest 条目
```ts
{ url: string, priority?: 0|1|2, name?: string, attractionId?: string, castShadow?: boolean }
```

## 协作流程

- **你（3D 开发）**：只修改 `scene3d/` 目录下的文件
- **同事（框架开发）**：只修改 `main_new.js`、`ui/`、`api/`、`config.js` 等
- **合并**：只要接口签名不变，git merge 零冲突
- **接口变更**：先沟通，更新本文档，双方同步修改
