# Cesium 核心 API 介绍

参考 `Three.js项目` 的组织方式，使用 **Vite + Vue3 + TypeScript + Naive UI + UnoCSS** 构建的
**CesiumJS 1.145 核心 API 与功能**教学项目。左侧菜单按「基础 / 进阶 / 应用」三级目录组织，
每个页面 = 可交互的三维场景（左侧）+ 对应示例代码与原理讲解（右侧）。

## 功能总览

### 基础（10 页）
| 页面 | 覆盖 API |
|---|---|
| Viewer 入门 | Viewer 创建、UI 控件、光照、大气与星空 |
| 相机 Camera | setView / flyTo / lookAt / flyToBoundingSphere / 状态读取 |
| 影像与地形 | 多影像源切换、图层叠加透明度、Cesium World Terrain |
| 实体 Entity | Point / Label / Billboard / Polyline / Polygon / Wall / Box / Ellipsoid / Corridor |
| 坐标系与转换 | 经纬度 ↔ Cartesian3 ↔ Cartographic ↔ 屏幕坐标、距离计算 |
| 材质 Material | Color / Stripe / Checkerboard / Grid / Image / Glow / Arrow / Dash |
| 事件与拾取 | ScreenSpaceEventHandler、scene.pick、深度拾取、双击飞行 |
| 时钟与时间轴 | Clock、动画控件、倍速、CallbackProperty 动态实体 |
| 图元 Primitive | GeometryInstance 批量渲染、Entity vs Primitive 性能对比 |
| 标注与广告牌 | Label 样式、Billboard、PinBuilder、集合批量 |

### 进阶（8 页）
| 页面 | 覆盖 API |
|---|---|
| 3D Tiles 加载 | Cesium3DTileset、Cesium OSM Buildings、样式化、属性查询 |
| glTF 模型 | Model.fromGltfAsync、Entity.model、骨骼动画、节点与矩阵变换 |
| 粒子系统 | ParticleSystem：火焰 / 喷泉 / 降雨 / 降雪 |
| 后期处理 | PostProcessStage：模糊 / 描边 / 夜视 / 黑白 / 自定义着色器 |
| 深度拾取 | scene.pick / pickPosition / pickEllipsoid / drillPick |
| 空间数据加载 | GeoJSON / KML / CZML（含时间动态数据） |
| 动态效果 | CallbackProperty：流动光点 / 扩散波纹 / 动态箭头 / 扫描圈 |
| 自定义着色器 | CustomShader：变色 / 渐变 / 顶点波动 / 剖面裁剪 |

### 应用（3 页）
| 页面 | 覆盖 API |
|---|---|
| 飞行漫游 | CatmullRomSpline 路径 + 每帧相机跟随 + 朝向计算 |
| 三维量测 | 测距（点距累加）、测面积（切平面投影 + 鞋带公式） |
| 轨迹模拟 | SampledPositionProperty 采样、VelocityOrientationProperty、时间轴联动 |

## 快速开始

```bash
npm install
npm run dev        # 开发调试 http://localhost:5173
npm run build      # 类型检查 + 生产构建
npm run preview    # 预览构建产物
```

## 项目结构

```
├── router/index.ts                  # 三级目录路由（hash 模式）
├── vite.config.ts                   # Cesium 静态资源拷贝 + CESIUM_BASE_URL
└── src/
    ├── main.ts                      # 入口（引入 Cesium widgets.css）
    ├── App.vue                      # 侧边导航布局
    ├── hooks/
    │   ├── useCesiumViewer.ts       # Viewer 生命周期统一封装（底图/地形/时钟/每帧回调）
    │   └── useCodeExplain.ts        # 教学面板代码/讲解联动
    ├── components/base/CodePanel.vue # 代码 + 原理讲解面板
    ├── utils/codeHighlight.ts       # 轻量语法高亮
    └── views/business/
        ├── basics/                  # 基础篇 10 页
        ├── forward/                 # 进阶篇 8 页
        └── application/             # 应用篇 3 页
```

## Cesium 工程集成说明

1. **静态资源**：`vite.config.ts` 通过 `vite-plugin-static-copy`（`rename.stripBase: 5`）把
   `cesium/Build/Cesium/{Workers,ThirdParty,Assets,Widgets}` 拷贝到构建产物的 `/cesium/` 目录，
   并用 `define` 注入 `CESIUM_BASE_URL = '/cesium/'`（生产打包时替换 node_modules 内标识符）。
   开发模式 Vite 预打包不替换 node_modules 内代码，因此 `main.ts` 里额外设置了
   `window.CESIUM_BASE_URL = '/cesium/'` 全局变量，两种模式均生效。
2. **样式**：`main.ts` 引入 `cesium/Build/Cesium/Widgets/widgets.css`。
3. **Ion token**：使用 CesiumJS 1.145 内置默认评估 token（可访问 Cesium World
   Terrain / OSM Buildings 等公开资源）。生产环境请到 <https://ion.cesium.com>
   注册后自行替换。
4. **网络资源**：影像底图使用 Esri World Imagery / Street Map（无需 token）；
   3D Tiles 与 glTF 示例通过 jsdelivr CDN 加载（国内可达）。

## 技术栈版本

- CesiumJS 1.145（ESM + 内置 TS 类型）
- Vue 3.5 / Vue Router 5 / Pinia 4 / Naive UI 2.45
- Vite 8 / TypeScript 6 / UnoCSS
