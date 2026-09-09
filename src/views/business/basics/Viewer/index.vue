<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, provide, ref } from "vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";
import SplitViewer from "@/components/base/SplitViewer.vue";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);

const activeFeature = ref("create");

// 分割条拖拽时通知 viewer 重新计算渲染尺寸
function onSplitChange() {
  viewer.value?.resize();
}

// 本页开启全部 UI 控件，便于演示控件的显示/隐藏
const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "esri",
  camera: { position: [108.9, 34.2, 2200000], pitch: -55 },
  ui: {
    animation: true,
    timeline: true,
    baseLayerPicker: true,
    geocoder: true,
    homeButton: true,
    sceneModePicker: true,
    navigationHelpButton: true,
    fullscreenButton: true,
  },
});

// 供 UI 开关引用的控件容器（延迟到 viewer 创建后取值）
const uiParts: { key: string; label: string; get: () => HTMLElement | null }[] =
  [
    {
      key: "homeButton",
      label: "主页按钮",
      get: () =>
        (viewer.value?.homeButton.container as HTMLElement | null) ?? null,
    },
    {
      key: "sceneModePicker",
      label: "场景模式",
      get: () =>
        (viewer.value?.sceneModePicker.container as HTMLElement | null) ?? null,
    },
    {
      key: "geocoder",
      label: "地理搜索",
      get: () =>
        (viewer.value?.geocoder.container as HTMLElement | null) ?? null,
    },
    {
      key: "baseLayerPicker",
      label: "底图选择",
      get: () =>
        (viewer.value?.baseLayerPicker.container as HTMLElement | null) ?? null,
    },
    {
      key: "navigationHelpButton",
      label: "帮助按钮",
      get: () =>
        (viewer.value?.navigationHelpButton.container as HTMLElement | null) ??
        null,
    },
    {
      key: "fullscreenButton",
      label: "全屏按钮",
      get: () =>
        (viewer.value?.fullscreenButton.container as HTMLElement | null) ??
        null,
    },
    {
      key: "animation",
      label: "动画控件",
      get: () =>
        (viewer.value?.animation.container as HTMLElement | null) ?? null,
    },
    {
      key: "timeline",
      label: "时间轴",
      get: () =>
        (viewer.value?.timeline.container as HTMLElement | null) ?? null,
    },
  ];

const uiVisible = ref<Record<string, boolean>>(
  Object.fromEntries(uiParts.map((p) => [p.key, true]))
);

function applyUi(show: boolean) {
  for (const p of uiParts) {
    const el = p.get();
    if (el) el.style.display = show ? "" : "none";
    uiVisible.value[p.key] = show;
  }
}

const lightingOn = ref(false);
function applyLighting() {
  lightingOn.value = !lightingOn.value;
  const globe = viewer.value?.scene.globe;
  if (globe) globe.enableLighting = lightingOn.value;
}

const atmosphereOn = ref(true);
function applyAtmosphere() {
  atmosphereOn.value = !atmosphereOn.value;
  const scene = viewer.value?.scene;
  if (!scene) return;
  // 1.145：大气/天体组件可能为 undefined，需判空
  if (scene.skyBox) scene.skyBox.show = atmosphereOn.value;
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = atmosphereOn.value;
  if (scene.sun) scene.sun.show = atmosphereOn.value;
  if (scene.moon) scene.moon.show = atmosphereOn.value;
}

function applyReset() {
  activeFeature.value = "create";
  applyUi(true);
  lightingOn.value = false;
  atmosphereOn.value = true;
  const v = viewer.value;
  if (v) {
    v.scene.globe.enableLighting = false;
    if (v.scene.skyBox) v.scene.skyBox.show = true;
    if (v.scene.skyAtmosphere) v.scene.skyAtmosphere.show = true;
    if (v.scene.sun) v.scene.sun.show = true;
    if (v.scene.moon) v.scene.moon.show = true;
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(108.9, 34.2, 2200000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 },
      duration: 1.2,
    });
  }
}

function onFeatureClick(feature: string) {
  activeFeature.value = feature;
}

onMounted(() => {
  // 初始高亮当前场景对应代码
  activeFeature.value = "create";
});

const codeMap: Record<string, () => string> = {
  create: () => `// ① 创建三维地球 —— 一行代码即可
const viewer = new Cesium.Viewer('cesiumContainer')

// 常用配置项
const viewer = new Cesium.Viewer('cesiumContainer', {
  baseLayer: Cesium.ImageryLayer.fromProviderAsync(   // 底图影像
    Cesium.UrlTemplateImageryProvider.fromUrl('...')),
  terrain: new Cesium.Terrain(                        // 地形
    Cesium.createWorldTerrainAsync()),
  animation: false,        // 动画控件
  timeline: false,         // 时间轴
  baseLayerPicker: false,  // 底图选择器
  geocoder: false,         // 地理搜索框
  infoBox: false,          // 信息框
})`,

  ui: () => `// ② UI 控件开关：每个控件对应一个 DOM 容器
viewer.homeButton.container.style.display   = 'none'
viewer.sceneModePicker.container.style.display = 'none'
viewer.geocoder.container.style.display     = 'none'
viewer.baseLayerPicker.container.style.display = 'none'
viewer.animation.container.style.display    = 'none'   // 播放/暂停动画
viewer.timeline.container.style.display     = 'none'   // 时间轴
// 显示时置回 '' 即可`,

  lighting: () => `// ③ 昼夜光照：根据太阳方向产生明暗面
viewer.scene.globe.enableLighting = true   // 当前：${
    lightingOn.value ? "开" : "关"
  }
// ★ 需要开启 Viewer 默认的太阳（scene.sun）
// ★ 地形/模型接收光照后呈现实时明暗变化`,

  atmosphere: () => `// ④ 大气与星空：环绕地球的蓝色大气、星空背景
viewer.scene.skyBox.show        = ${atmosphereOn.value}   // 星空盒
viewer.scene.skyAtmosphere.show = ${atmosphereOn.value}   // 大气散射
viewer.scene.sun.show           = ${atmosphereOn.value}   // 太阳
viewer.scene.moon.show          = ${atmosphereOn.value}   // 月球
// ★ 切换后立即生效，无需重新渲染`,
};

const explainMap: Record<string, () => string> = {
  create: () => `【原理】Viewer 是 CesiumJS 的“一站式”入口，内部组装了：
• CesiumWidget：负责 WebGL 渲染场景（Scene/Camera/Globe）
• 控件层：Animation、Timeline、HomeButton、BaseLayerPicker 等
• DataSourceDisplay：负责 Entity/GeoJSON/KML/CZML 数据的可视化

【底图】默认使用 Cesium World Imagery（需 Ion token）。
本示例默认使用 Esri World Imagery（无需 token，国内可访问）。

【要点】页面里每个“示例代码”面板展示的都是对应功能的精简核心代码，可复制到任意 Cesium 项目中复用。`,

  ui: () => `【原理】Viewer 的每个 UI 控件都是独立 DOM 容器，可通过
viewer.xxx.container.style.display 控制显隐（'none' 隐藏 / '' 显示）。

【当前状态】点击下方按钮可隐藏/显示：主页按钮、场景模式、地理搜索、底图选择、帮助、全屏、动画、时间轴。

【要点】动画控件（Animation）和时间轴（Timeline）配合时钟使用，
在“时钟与时间轴”和“轨迹模拟”页面会真正用到。`,

  lighting:
    () => `【原理】globe.enableLighting = true 时，Cesium 根据太阳在天空中的位置
实时计算地球表面光照，白天/黑夜分界清晰可见。

【观察】切换到中国上空视角时，可看到东半球亮、西半球暗；
地球自转/时间变化后明暗交界会移动。

【要点】开启后需保持 scene.sun.show = true，否则无光源。`,

  atmosphere: () => `【原理】
• SkyBox：立方体星空背景（Cesium 内置 8K 星图纹理）
• SkyAtmosphere：基于大气散射模型渲染的蓝色辉光（地平线处渐亮）
• Sun/Moon：按天文位置计算的光源与天体

【观察】关闭后地球背景变为纯黑，打开后呈现真实太空感。

【要点】SkyAtmosphere 只在默认 WGS84 椭球上生效。`,
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
        :type="activeFeature === 'create' ? 'primary' : 'default'"
        @click="onFeatureClick('create')"
        >创建 Viewer</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'ui' ? 'primary' : 'default'"
        @click="
          onFeatureClick('ui');
          applyUi(false);
        "
        >隐藏控件</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'ui' ? 'primary' : 'default'"
        @click="
          onFeatureClick('ui');
          applyUi(true);
        "
        >显示控件</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'lighting' ? 'primary' : 'default'"
        @click="
          onFeatureClick('lighting');
          applyLighting();
        "
        >昼夜光照：{{ lightingOn ? "开" : "关" }}</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'atmosphere' ? 'primary' : 'default'"
        @click="
          onFeatureClick('atmosphere');
          applyAtmosphere();
        "
        >大气与星空：{{ atmosphereOn ? "开" : "关" }}</n-button
      >
      <n-button size="small" quaternary @click="applyReset">重置</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      @split-change="onSplitChange"
    />
  </div>
</template>
