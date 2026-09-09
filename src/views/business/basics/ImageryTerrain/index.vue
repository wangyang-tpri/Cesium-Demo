<script setup lang="ts">
import * as Cesium from "cesium";
import { ref, provide } from "vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";
import SplitViewer from "@/components/base/SplitViewer.vue";
import {
  createTiandituVecLayers,
  createTiandituImgLayers,
  TIANDITU_TK,
} from "@/utils/tianditu";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref("tianditu-vec");
const statusText = ref("当前底图：天地图街道图（矢量）");

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-vec",
  camera: { position: [108.9, 34.2, 3000000], pitch: -60 },
});

// 分割条拖拽时通知 viewer 重新计算渲染尺寸
function onSplitChange() {
  viewer.value?.resize();
}

let terrainOn = false;
let overlayLayer: Cesium.ImageryLayer | null = null;

/** 替换当前所有影像图层（支持多层） */
function setBaseLayers(layers: Cesium.ImageryLayer[]) {
  const v = viewer.value;
  if (!v) return;
  v.imageryLayers.removeAll();
  for (const layer of layers) {
    v.imageryLayers.add(layer);
  }
}

function applyTiandituImg() {
  activeFeature.value = "tianditu-img";
  setBaseLayers(createTiandituImgLayers());
  statusText.value = "当前底图：天地图影像（卫星图 + 注记）";
}

function applyTiandituVec() {
  activeFeature.value = "tianditu-vec";
  setBaseLayers(createTiandituVecLayers());
  statusText.value = "当前底图：天地图街道图（矢量 + 注记）";
}

function applyNaturalEarth() {
  activeFeature.value = "natural";
  const v = viewer.value;
  if (!v) return;
  v.imageryLayers.removeAll();
  // 使用 Cesium 本地内置的自然地球纹理（无需网络）
  Cesium.TileMapServiceImageryProvider.fromUrl(
    Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII")
  )
    .then((p) => v.imageryLayers.add(new Cesium.ImageryLayer(p)))
    .catch((e) => console.error(e));
  statusText.value = "当前底图：Natural Earth（本地纹理）";
}

function applyNoBase() {
  activeFeature.value = "none";
  const v = viewer.value;
  if (!v) return;
  v.imageryLayers.removeAll();
  // 无影像时地球底色可自定义（此处用深蓝海洋色）
  v.scene.globe.baseColor = Cesium.Color.fromCssColorString("#1e3a5f");
  statusText.value = "当前底图：无（纯椭球 + 经纬网）";
}

function applyTerrain() {
  activeFeature.value = "terrain";
  const v = viewer.value;
  if (!v) return;
  terrainOn = !terrainOn;
  if (terrainOn) {
    // Cesium World Terrain：全球真实地形高程（含海底）
    v.scene.setTerrain(new Cesium.Terrain(Cesium.createWorldTerrainAsync()));
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(86.925, 27.988, 300000), // 珠穆朗玛峰
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-45), roll: 0 },
      duration: 2,
    });
    statusText.value = "地形：Cesium World Terrain（已飞往珠峰）";
  } else {
    v.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    statusText.value = "地形：已还原为椭球面（无地形）";
  }
}

function applyOverlay() {
  activeFeature.value = "overlay";
  const v = viewer.value;
  if (!v) return;
  if (overlayLayer) {
    v.imageryLayers.remove(overlayLayer);
    overlayLayer = null;
    statusText.value = "叠加层：已移除";
    return;
  }
  // 在现有底图上叠加一层天地图街道注记，半透明显示
  const layers = createTiandituVecLayers();
  overlayLayer = layers[1]!; // 注记层
  overlayLayer.alpha = 0.7;
  v.imageryLayers.add(overlayLayer);
  statusText.value = "叠加层：天地图注记 alpha=0.7 覆盖在影像上";
}

const codeMap: Record<string, () => string> = {
  "tianditu-img": () => `// ① 天地图影像（WMTS，需 tk）
const tk = '${TIANDITU_TK}'
const imgProvider = new Cesium.WebMapTileServiceImageryProvider({
  url: \`https://t{s}.tianditu.gov.cn/img_w/wmts?service=wmts&request=GetTile&version=1.0.0&LAYER=img&tileMatrixSet=w&TileMatrix={TileMatrix}&TileRow={TileRow}&TileCol={TileCol}&style=default&format=tiles&tk=\${tk}\`,
  subdomains: ['0','1','2','3','4','5','6','7'],
  layer: 'img', style: 'default', format: 'tiles',
  tileMatrixSetID: 'w', maximumLevel: 18,
})
// 影像注记 cia（同上，layer 改为 'cia'）
viewer.imageryLayers.add(new Cesium.ImageryLayer(imgProvider))`,

  "tianditu-vec": () => `// ② 天地图街道矢量（WMTS，需 tk）
const tk = '${TIANDITU_TK}'
const vecProvider = new Cesium.WebMapTileServiceImageryProvider({
  url: \`https://t{s}.tianditu.gov.cn/vec_w/wmts?service=wmts&request=GetTile&version=1.0.0&LAYER=vec&tileMatrixSet=w&TileMatrix={TileMatrix}&TileRow={TileRow}&TileCol={TileCol}&style=default&format=tiles&tk=\${tk}\`,
  subdomains: ['0','1','2','3','4','5','6','7'],
  layer: 'vec', style: 'default', format: 'tiles',
  tileMatrixSetID: 'w', maximumLevel: 18,
})
// 矢量注记 cva（同上，layer 改为 'cva'）
viewer.imageryLayers.add(new Cesium.ImageryLayer(vecProvider))`,

  none: () => `// ③ 无影像：纯椭球 + 可自定义底色
viewer.imageryLayers.removeAll()
viewer.scene.globe.baseColor =
  Cesium.Color.fromCssColorString('#1e3a5f')
// 经纬网线：globe.showGroundAtmosphere 等也与此相关`,

  natural: () => `// ④ 本地内置纹理：Natural Earth（离线可用）
const layer = await Cesium.ImageryLayer.fromProviderAsync(
  Cesium.TileMapServiceImageryProvider.fromUrl(
    Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII')
  )
)
viewer.imageryLayers.add(layer)`,

  terrain: () => `// ⑤ 全球真实地形（Cesium World Terrain）
viewer.scene.setTerrain(
  new Cesium.Terrain(Cesium.createWorldTerrainAsync())
)
// 还原为椭球面（无地形）
viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider()
// ★ 有地形后：贴地对象需设置 heightReference`,

  overlay: () => `// ⑥ 多图层叠加 + 透明度
const overlay = new Cesium.ImageryLayer(provider)
overlay.alpha = 0.5        // 不透明度
overlay.brightness = 1.1   // 亮度
overlay.saturation = 0.8   // 饱和度
viewer.imageryLayers.add(overlay)  // 叠在现有图层之上`,
};

const explainMap: Record<string, () => string> = {
  "tianditu-img":
    () => `【原理】天地图影像采用 WMTS 标准服务，WebMapTileServiceImageryProvider 加载。
天地图影像 = img（影像底图）+ cia（影像注记）两层叠加。
subdomains t0-t7 做负载均衡，tk 为开发者密钥。

【要点】天地图是国家地理信息公共服务平台，国内访问速度快，
符合国内地图规范，适合生产环境使用。最大级别 18 级。`,

  "tianditu-vec": () => `【原理】天地图矢量街道同样采用 WMTS 服务。
矢量街道 = vec（矢量底图）+ cva（矢量注记）两层叠加。
底图是预渲染的栅格瓦片，注记层单独叠加便于控制。

【要点】多底图切换的本质：移除旧图层 → 添加新图层。
imageryLayers.removeAll() 清空；add() 追加到最上层。
天地图矢量图适合作为业务系统的默认底图。`,

  none: () => `【原理】移除影像后地球只剩椭球体，globe.baseColor 决定底色。
这是“白膜/暗夜模式”等场景的基础做法。

【要点】经纬网（globe.showGroundAtmosphere）与网格开关可继续叠加。`,

  natural:
    () => `【原理】Cesium 安装包内置了 Natural Earth 全球纹理（Build/Cesium/Assets/Textures）。
buildModuleUrl() 把资源路径解析到 CESIUM_BASE_URL 下，完全离线可用。

【要点】这是快速验证/无网环境下的兜底底图方案。`,

  terrain: () => `【原理】Cesium World Terrain 提供全球 30m 分辨率真实高程，
地形起伏来自 Quantized-Mesh 瓦片，按视距动态细化。
对比：椭球面（EllipsoidTerrainProvider）无起伏。

【观察】切换到地形后飞往珠峰，可看到真实山体；再次点击还原为光滑球面。

【要点】地形开启后，贴地实体建议设置 heightReference: CLAMP_TO_GROUND。`,

  overlay: () => `【原理】imageryLayers 支持任意多层叠加，每层可独立调节：
alpha 不透明度 / brightness 亮度 / contrast 对比度 / saturation 饱和度 / hue 色相。

【观察】当前在影像上叠加 50% 透明度的街道图，道路与卫星影像融合显示。`,
};

const { code, explanation } = useCodeExplain(
  codeMap,
  explainMap,
  activeFeature
);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button
        size="small"
        :type="activeFeature === 'tianditu-img' ? 'primary' : 'default'"
        @click="applyTiandituImg"
        >天地图影像</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'tianditu-vec' ? 'primary' : 'default'"
        @click="applyTiandituVec"
        >天地图街道</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'natural' ? 'primary' : 'default'"
        @click="applyNaturalEarth"
        >Natural Earth</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'none' ? 'primary' : 'default'"
        @click="applyNoBase"
        >无底图</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'terrain' ? 'primary' : 'default'"
        @click="applyTerrain"
        >世界地形：{{ terrainOn ? "开" : "关" }}</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'overlay' ? 'primary' : 'default'"
        @click="applyOverlay"
        >{{ overlayLayer ? "移除叠加层" : "叠加注记层" }}</n-button
      >
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="imageryterrain-split"
      @split-change="onSplitChange"
    >
      <template #scene-overlay>
        <div
          class="absolute left-3 top-3 z-10 rounded bg-black/60 px-3 py-1.5 text-xs text-white"
        >
          {{ statusText }}
        </div>
      </template>
    </SplitViewer>
  </div>
</template>
