<script setup lang="ts">
import * as Cesium from 'cesium';
import { onMounted, ref } from 'vue';
import { useCesiumViewer } from '@/hooks/useCesiumViewer';
import { useCodeExplain } from '@/hooks/useCodeExplain';
import CodePanel from '@/components/base/CodePanel.vue';

const containerRef = ref<HTMLDivElement | null>(null);
const activeFeature = ref('deg2cart');
const statusText = ref('点击地球任意位置，体验“屏幕坐标 → 地理坐标”转换');

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: 'esri',
  camera: { position: [108.9, 34.2, 2600000], pitch: -60 },
});

let clickHandler: Cesium.ScreenSpaceEventHandler | null = null;
let marker: Cesium.Entity | null = null;
let lineEntity: Cesium.Entity | null = null;

onMounted(() => {
  const v = viewer.value;
  if (!v) return;
  clickHandler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
  clickHandler.setInputAction((e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    // 屏幕像素坐标 → 椭球面世界坐标
    const cartesian = v.camera.pickEllipsoid(e.position, v.scene.globe.ellipsoid);
    if (!cartesian) return;
    // 世界坐标 → 弧度坐标 → 角度
    const carto = Cesium.Cartographic.fromCartesian(cartesian);
    const lon = Cesium.Math.toDegrees(carto.longitude);
    const lat = Cesium.Math.toDegrees(carto.latitude);
    const height = carto.height;

    // 落点标记
    if (marker) v.entities.remove(marker);
    marker = v.entities.add({
      position: cartesian,
      point: { pixelSize: 10, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
      label: {
        text: `经度 ${lon.toFixed(4)}°\n纬度 ${lat.toFixed(4)}°\n高度 ${height.toFixed(0)} m`,
        font: '13px Microsoft YaHei, sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -34),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    statusText.value = `点击点：经度 ${lon.toFixed(4)}°，纬度 ${lat.toFixed(4)}°，高度 ${height.toFixed(0)} m`;
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
});

/* 北京 → 西安 距离演示 */
function applyDistance() {
  activeFeature.value = 'distance';
  const v = viewer.value;
  if (!v) return;
  const beijing = Cesium.Cartesian3.fromDegrees(116.397, 39.909, 0);
  const xian = Cesium.Cartesian3.fromDegrees(108.94, 34.341, 0);

  if (lineEntity) v.entities.remove(lineEntity);
  lineEntity = v.entities.add({
    polyline: {
      positions: [beijing, xian],
      width: 3,
      material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.3, color: Cesium.Color.ORANGE }),
      clampToGround: true,
    },
    point: {
      pixelSize: 8,
      color: Cesium.Color.ORANGE,
    },
  });

  // 直线距离（穿过地球内部）
  const straightKm = Cesium.Cartesian3.distance(beijing, xian) / 1000;
  // 地表大圆距离（沿地球表面）
  const geo = new Cesium.EllipsoidGeodesic(
    Cesium.Cartographic.fromCartesian(beijing),
    Cesium.Cartographic.fromCartesian(xian)
  );
  const surfaceKm = geo.surfaceDistance / 1000;
  statusText.value =
    `北京→西安：直线距离 ${straightKm.toFixed(0)} km，` + `地表大圆距离 ${surfaceKm.toFixed(0)} km`;
}

/* 世界坐标 → 屏幕坐标 */
function applyWorldToScreen() {
  activeFeature.value = 'world2screen';
  const v = viewer.value;
  if (!v) return;
  const cartesian = Cesium.Cartesian3.fromDegrees(108.94, 34.341, 0);
  const windowPos = Cesium.SceneTransforms.worldToWindowCoordinates(v.scene, cartesian);
  if (windowPos) {
    statusText.value = `世界坐标(108.94,34.341) → 屏幕坐标 (${windowPos.x.toFixed(0)}, ${windowPos.y.toFixed(0)}) px`;
  } else {
    statusText.value = '目标点在屏幕外（相机背面），无法投影';
  }
}

function onFeatureClick(feature: string) {
  activeFeature.value = feature;
  if (feature === 'deg2cart') {
    statusText.value = '经度/纬度/高度 → Cartesian3 地固系坐标（单位：米）';
  } else if (feature === 'cart2carto') {
    statusText.value = 'Cartesian3 → Cartographic(弧度) → 角度';
  }
}

const codeMap: Record<string, () => string> = {
  deg2cart: () => `// ① 经纬度(度) + 高度(米) → 世界坐标 Cartesian3
const position = Cesium.Cartesian3.fromDegrees(
  108.94,    // 经度
  34.341,    // 纬度
  0          // 高度（椭球面以上，米）
)
// 或批量转换
const arr = Cesium.Cartesian3.fromDegreesArray([
  108.94, 34.34, 108.95, 34.35,
])`,

  cart2carto: () => `// ② 世界坐标 → 弧度坐标 → 角度
const carto = Cesium.Cartographic.fromCartesian(position)
carto.longitude          // 弧度
carto.latitude           // 弧度
carto.height             // 高度(米)

// 弧度 → 角度（人更易读）
const lon = Cesium.Math.toDegrees(carto.longitude)
const lat = Cesium.Math.toDegrees(carto.latitude)`,

  screen2world: () => `// ③ 屏幕像素坐标 → 地理坐标（点击拾取）
const handler = new Cesium.ScreenSpaceEventHandler(
  viewer.scene.canvas)
handler.setInputAction((e) => {
  // e.position: 屏幕坐标(Cartesian2)
  const cartesian = viewer.camera.pickEllipsoid(
    e.position, viewer.scene.globe.ellipsoid)
  const carto = Cesium.Cartographic.fromCartesian(cartesian)
  // → 经纬度
}, Cesium.ScreenSpaceEventType.LEFT_CLICK)`,

  distance: () => `// ④ 距离计算
// 直线距离（穿过地球内部）
const d = Cesium.Cartesian3.distance(a, b)

// 地表大圆距离（沿地球表面最短弧线）
const geo = Cesium.EllipsoidGeodesic.fromCartesian3(a, b)
const km = geo.surfaceDistance / 1000

// 平面贴地距离（忽略高度）
const plane = Cesium.EllipsoidTangentPlane.fromPoints([a, b])`,

  world2screen: () => `// ⑤ 世界坐标 → 屏幕坐标（反投影）
const windowPos =
  Cesium.SceneTransforms.worldToWindowCoordinates(
    viewer.scene, cartesian)
// windowPos.x / windowPos.y：像素坐标
// ★ 用于在固定位置叠加 DOM 元素（如跟随标注）
`,
};

const explainMap: Record<string, () => string> = {
  deg2cart: () => `【原理】Cesium 内部统一使用地固系直角坐标 Cartesian3（x/y/z，单位米，
原点为地球质心，随地球自转）。所有绘制、拾取、计算都以它为基础。
经纬度只是“人类友好的输入形式”，进入 API 前一律换算。

【转换函数】
• fromDegrees(lon, lat, height)
• fromDegreesArray / fromDegreesArrayHeights：批量
• fromRadians：直接给弧度`,

  cart2carto: () => `【原理】Cartographic 是 Cesium 的“经纬度+高度”内部表示，
但 longitude/latitude 单位是弧度（不是度！）。
Cartographic.fromCartesian 是世界坐标反解得到的弧度坐标。

【要点】转成角度必须用 Cesium.Math.toDegrees()；
反之 toRadians() 用于把角度喂给相机/朝向。`,

  screen2world: () => `【原理】camera.pickEllipsoid 从相机出发，向屏幕点方向发射射线，
与椭球面求交得到世界坐标——即“点击到地球表面”的核心 API。

【变体】
• scene.pick：拾取场景中的实体/模型
• scene.pickPosition：拾取深度缓冲区位置（含模型表面）
• camera.pickEllipsoid：拾取椭球面（忽略物体）

【要点】本页点击体验即此原理；事件系统在“事件与拾取”页展开。`,

  distance: () => `【原理】三种距离语义不同：
• Cartesian3.distance：欧氏直线距离（穿过地球内部，工程上极少用）
• EllipsoidGeodesic.surfaceDistance：沿椭球面的大圆距离（球面最短路径）
• EllipsoidTangentPlane：在切平面上投影后的平面距离（小范围测量）

【结果】北京→西安：直线 ≈ 939 km，地表大圆 ≈ 940 km（差异来自地球曲率）。`,

  world2screen: () => `【原理】wgs84ToWindowCoordinates 是 pickEllipsoid 的逆过程：
把世界坐标投影到当前相机视角下的屏幕像素位置。

【用途】在三维场景上方叠加 2D DOM 元素（数据面板、跟随标签、DOM 标注），
每帧调用即可实现“吸附在地理位置上的 HTML 控件”。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" :type="activeFeature === 'deg2cart' ? 'primary' : 'default'" @click="onFeatureClick('deg2cart')">经纬度 → 笛卡尔</n-button>
      <n-button size="small" :type="activeFeature === 'cart2carto' ? 'primary' : 'default'" @click="onFeatureClick('cart2carto')">笛卡尔 → 弧度坐标</n-button>
      <n-button size="small" :type="activeFeature === 'screen2world' ? 'primary' : 'default'" @click="onFeatureClick('screen2world')">点击取坐标（体验）</n-button>
      <n-button size="small" :type="activeFeature === 'distance' ? 'primary' : 'default'" @click="applyDistance">北京→西安 距离</n-button>
      <n-button size="small" :type="activeFeature === 'world2screen' ? 'primary' : 'default'" @click="applyWorldToScreen">世界 → 屏幕坐标</n-button>
    </div>

    <div class="flex min-h-0 flex-1 gap-3">
      <div class="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-gray-200 shadow-sm">
        <div ref="containerRef" class="h-full w-full"></div>
        <div class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white">{{ statusText }}</div>
      </div>
      <CodePanel :title="activeFeature" :code="code" :explanation="explanation" />
    </div>
  </div>
</template>
