<script setup lang="ts">
import * as Cesium from 'cesium';
import { onMounted, ref, provide } from 'vue';
import { useCesiumViewer } from '@/hooks/useCesiumViewer';
import { useCodeExplain } from '@/hooks/useCodeExplain';
import SplitViewer from '@/components/base/SplitViewer.vue';

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref('distance');
const statusText = ref('选择“测距/测面积”，然后在地球上点击布点；点“完成/清除”结束。');

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: 'esri',
  camera: { position: [108.94, 34.34, 12000], pitch: -55 },
});

// 分割条拖拽时通知 viewer 重新计算渲染尺寸
function onSplitChange() {
  viewer.value?.resize();
}

type Mode = 'distance' | 'area';
const mode = ref<Mode>('distance');

let handler: Cesium.ScreenSpaceEventHandler | null = null;
let points: Cesium.Cartesian3[] = [];

// 可视化实体
let lineEntity: Cesium.Entity | null = null;
let polygonEntity: Cesium.Entity | null = null;

const METERS_PER_KM = 1000;

function resetMeasurements() {
  points = [];
  const v = viewer.value;
  if (!v) return;
  for (const e of [lineEntity, polygonEntity]) {
    if (e) v.entities.remove(e);
  }
  lineEntity = null;
  polygonEntity = null;
}

function setMode(m: Mode) {
  mode.value = m;
  activeFeature.value = m;
  resetMeasurements();
  statusText.value = m === 'distance' ? '测距模式：点击地球添加点，实时显示累计距离' : '测面积模式：点击添加多边形顶点，点“完成”计算面积';
}

/** 计算折线总长（米） */
function totalDistance(): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += Cesium.Cartesian3.distance(points[i - 1]!, points[i]!);
  }
  return sum;
}

/** 计算多边形面积（切平面投影 + 鞋带公式） */
function polygonArea(): number {
  if (points.length < 3) return 0;
  const plane = Cesium.EllipsoidTangentPlane.fromPoints(points);
  const proj = plane.projectPointsOntoPlane(points);
  let area2 = 0;
  for (let i = 0; i < proj.length; i++) {
    const a = proj[i]!;
    const b = proj[(i + 1) % proj.length]!;
    area2 += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area2) / 2;
}

function redraw() {
  const v = viewer.value;
  if (!v) return;
  for (const e of [lineEntity, polygonEntity]) {
    if (e) v.entities.remove(e);
  }
  lineEntity = null;
  polygonEntity = null;

  if (!points.length) return;

  // 逐点：圆点 + 序号标注
  points.forEach((p, i) => {
    v.entities.add({
      position: p,
      point: {
        pixelSize: 8,
        color: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
      },
      label: {
        text: String(i + 1),
        font: '11px monospace',
        fillColor: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -16),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  });

  if (mode.value === 'distance' && points.length > 1) {
    lineEntity = v.entities.add({
      polyline: {
        positions: points,
        width: 3,
        material: Cesium.Color.fromCssColorString('#00d2ff'),
        clampToGround: false,
      },
    });
  } else if (mode.value === 'area' && points.length > 2) {
    lineEntity = v.entities.add({
      polyline: {
        positions: [...points, points[0]!], // 闭合
        width: 3,
        material: Cesium.Color.fromCssColorString('#ff9f43'),
      },
    });
  }
}

onMounted(() => {
  const v = viewer.value;
  if (!v) return;
  handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
  handler.setInputAction((e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const cartesian = v.camera.pickEllipsoid(e.position, v.scene.globe.ellipsoid);
    if (!cartesian) return;
    points.push(cartesian);
    redraw();
    if (mode.value === 'distance') {
      const km = totalDistance() / METERS_PER_KM;
      statusText.value = `已布 ${points.length} 点，累计距离 ${km.toFixed(2)} km`;
    } else {
      const area = polygonArea();
      statusText.value = `已布 ${points.length} 个顶点${points.length >= 3 ? `，当前面积 ${formatArea(area)}` : ''}`;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
});

function formatArea(m2: number): string {
  if (m2 >= 1e6) return `${(m2 / 1e6).toFixed(2)} km²`;
  return `${m2.toFixed(0)} m²`;
}

function applyFinish() {
  const v = viewer.value;
  if (!v) return;
  if (mode.value === 'area' && points.length >= 3) {
    const area = polygonArea();
    polygonEntity = v.entities.add({
      polygon: {
        hierarchy: points,
        material: Cesium.Color.fromCssColorString('#e67e22').withAlpha(0.4),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#e67e22'),
        height: 0,
      },
    });
    statusText.value = `测面积完成：${formatArea(area)}（切平面投影 + 鞋带公式）`;
  } else {
    statusText.value = '面积测量需要至少 3 个顶点';
  }
}

function applyClear() {
  activeFeature.value = mode.value;
  resetMeasurements();
  statusText.value = '已清除全部测量';
}

const codeMap: Record<string, () => string> = {
  distance: () => `// ① 测距：逐点拾取 + 欧氏距离累加
const handler = new Cesium.ScreenSpaceEventHandler(
  viewer.scene.canvas)
handler.setInputAction((e) => {
  const cartesian = viewer.camera.pickEllipsoid(
    e.position, viewer.scene.globe.ellipsoid)
  points.push(cartesian)

  let sum = 0
  for (let i = 1; i < points.length; i++) {
    sum += Cesium.Cartesian3.distance(
      points[i - 1], points[i])   // 单位：米
  }
  // 绘制 polyline + 标注数字
}, Cesium.ScreenSpaceEventType.LEFT_CLICK)`,

  area: () => `// ② 测面积：切平面投影 + 鞋带公式
const plane =
  Cesium.EllipsoidTangentPlane.fromPoints(points)
const proj = plane.projectPointsOntoPlane(points)

let area2 = 0
for (let i = 0; i < proj.length; i++) {
  const a = proj[i]
  const b = proj[(i + 1) % proj.length]
  area2 += a.x * b.y - b.x * a.y
}
const area = Math.abs(area2) / 2   // 平方米`,
};

const explainMap: Record<string, () => string> = {
  distance: () => `【原理】测量工具 = 事件拾取（取点）+ 几何计算（求值）：
1. camera.pickEllipsoid 把鼠标位置映射到椭球面坐标
2. Cartesian3.distance 计算两点直线距离（米）
3. 连续点累加 = 折线总长（本示例为直线距离，
   如需地表距离可用 EllipsoidGeodesic.surfaceDistance）

【要点】真实工程中测距通常做贴地（考虑地形）：
camera.pickPosition + 沿地形线采样。`,

  area: () => `【原理】球面多边形无法直接用平面公式，标准做法：
1. EllipsoidTangentPlane.fromPoints：以点集中心建立椭球切平面
2. projectPointsOntoPlane：把三维点沿径向投影到平面上
3. 鞋带公式（Shoelace）：由平面二维坐标计算有向面积

【要点】小范围（<100km）投影误差可忽略；
大范围测量应改用球面三角或投影坐标系（如 Web Mercator）。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" :type="activeFeature === 'distance' ? 'primary' : 'default'" @click="setMode('distance')">测距</n-button>
      <n-button size="small" :type="activeFeature === 'area' ? 'primary' : 'default'" @click="setMode('area')">测面积</n-button>
      <n-button size="small" :type="activeFeature === 'area' ? 'primary' : 'default'" @click="applyFinish">完成（面积）</n-button>
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="measure-split"
      @split-change="onSplitChange"
    >
      <template #scene-overlay>
        <div class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white">{{ statusText }}</div>
      </template>
    </SplitViewer>
  </div>
</template>
