<script setup lang="ts">
import * as Cesium from "cesium";
import { ref, provide } from "vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";
import SplitViewer from "@/components/base/SplitViewer.vue";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref("analyze");
const statusText = ref("可视域分析：点击「设置观察点」，在地图上点击，然后设置参数计算可视域。");

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-img",
  camera: { position: [108.94, 34.25, 20000], pitch: -55 },
});

const observerHeight = ref(50); // 观察点高度（米）
const maxDistance = ref(3000); // 最大视距（米）
const rayCount = ref(60); // 射线数量（360°均匀分布）

let picking = false;
let observerPos: Cesium.Cartesian3 | null = null;
let observerEntity: Cesium.Entity | null = null;
let viewshedEntity: Cesium.Entity | null = null;
let raysEntity: Cesium.Entity | null = null;
let handler: Cesium.ScreenSpaceEventHandler | null = null;

function clearAll() {
  const v = viewer.value;
  if (!v) return;
  for (const e of [observerEntity, viewshedEntity, raysEntity]) {
    if (e) v.entities.remove(e);
  }
  observerEntity = viewshedEntity = raysEntity = null;
  observerPos = null;
}

function pickPoint(windowPos: Cesium.Cartesian2): Cesium.Cartesian3 | null {
  const v = viewer.value;
  if (!v) return null;
  const ray = v.camera.getPickRay(windowPos);
  if (!ray) return null;
  return v.scene.globe.pick(ray, v.scene) || null;
}

function startPicking() {
  clearAll();
  picking = true;
  statusText.value = "请在地图上点击设置观察点...";
  if (!handler) {
    const v = viewer.value!;
    handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
    handler.setInputAction((click: any) => {
      if (!picking) return;
      const pos = pickPoint(click.position);
      if (!pos) return;
      observerPos = pos;
      picking = false;
      // 添加观察点标记
      const carto = Cesium.Cartographic.fromCartesian(pos);
      const elevatedPos = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + observerHeight.value);
      observerEntity = v.entities.add({
        position: elevatedPos,
        point: { pixelSize: 14, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
        label: { text: "观察点", font: "14px sans-serif", pixelOffset: new Cesium.Cartesian2(0, -25), fillColor: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE },
      });
      statusText.value = `观察点已设置（高度 ${observerHeight.value}m，视距 ${maxDistance.value}m），点击"计算可视域"开始分析`;
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }
}

async function calculateViewshed() {
  const v = viewer.value;
  if (!v || !observerPos) {
    statusText.value = "⚠ 请先设置观察点";
    return;
  }
  statusText.value = "正在计算可视域（发射射线，采样地形）...";

  // 观察点位置（加高度）
  const obsCarto = Cesium.Cartographic.fromCartesian(observerPos);
  const obsPos = Cesium.Cartesian3.fromRadians(obsCarto.longitude, obsCarto.latitude, obsCarto.height + observerHeight.value);
  const obsHeight = obsCarto.height + observerHeight.value;

  const N = rayCount.value;
  const maxDist = maxDistance.value;
  const stepDist = 50; // 步进距离（米）
  const boundaryPoints: Cesium.Cartesian3[] = [];
  const rayLines: Cesium.Cartesian3[] = [];

  // 本地 ENU 坐标系（用于方向计算）
  const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(observerPos);

  for (let i = 0; i < N; i++) {
    const azimuth = (i / N) * Math.PI * 2; // 方位角（从正东逆时针）
    // 方向向量（ENU 坐标系：东=x, 北=y, 上=z）
    const dirEnu = new Cesium.Cartesian3(Math.cos(azimuth), Math.sin(azimuth), 0);
    // 转换到世界坐标系
    const dirWorld = Cesium.Matrix4.multiplyByPointAsVector(enuMatrix, dirEnu, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(dirWorld, dirWorld);

    // 沿方向步进采样，找到第一个被遮挡的点
    let visibleEnd = obsPos;
    let blocked = false;
    for (let dist = stepDist; dist <= maxDist; dist += stepDist) {
      const samplePos = Cesium.Cartesian3.add(obsPos, Cesium.Cartesian3.multiplyByScalar(dirWorld, dist, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      const sampleCarto = Cesium.Cartographic.fromCartesian(samplePos);
      // 采样地形高程
      const terrainPositions = await Cesium.sampleTerrainMostDetailed(v.terrainProvider, [sampleCarto]);
      const terrainHeight = terrainPositions[0]?.height ?? 0;
      // 视线高度（从观察点线性插值到采样点，假设视线水平）
      // 简化：视线高度 = 观察点高度（水平视线）
      if (terrainHeight > obsHeight - 1) {
        // 地形高于视线，被遮挡
        visibleEnd = Cesium.Cartesian3.fromRadians(sampleCarto.longitude, sampleCarto.latitude, terrainHeight + 1);
        blocked = true;
        break;
      }
      visibleEnd = samplePos;
    }

    boundaryPoints.push(visibleEnd);
    // 射线可视化（观察点到可视边界）
    rayLines.push(obsPos, visibleEnd);
  }

  // 清除旧的可视域
  if (viewshedEntity) v.entities.remove(viewshedEntity);
  if (raysEntity) v.entities.remove(raysEntity);

  // 绘制可视域多边形（边界点闭合）
  viewshedEntity = v.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(boundaryPoints),
      material: Cesium.Color.GREEN.withAlpha(0.3),
      outline: true,
      outlineColor: Cesium.Color.GREEN,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    },
  });

  // 绘制射线（白色半透明）
  raysEntity = v.entities.add({
    polyline: {
      positions: rayLines,
      width: 1,
      material: Cesium.Color.WHITE.withAlpha(0.3),
    },
  });

  // 统计可视比例
  const visibleCount = boundaryPoints.filter((_, i) => {
    const dist = Cesium.Cartesian3.distance(obsPos, boundaryPoints[i]);
    return dist >= maxDist - stepDist;
  }).length;
  const visibleRatio = ((visibleCount / N) * 100).toFixed(1);

  statusText.value = `✅ 可视域计算完成：${N} 条射线，视距 ${maxDist}m，约 ${visibleRatio}% 方向完全可视（绿色=可视区域，白线=射线边界）`;
}

function applySetObserver() {
  activeFeature.value = "analyze";
  startPicking();
}

function applyCalculate() {
  activeFeature.value = "analyze";
  calculateViewshed();
}

function applyClear() {
  activeFeature.value = "analyze";
  picking = false;
  clearAll();
  statusText.value = "已清除，点击「设置观察点」重新设置。";
}

const codeMap: Record<string, () => string> = {
  analyze: () => `// ① 从观察点向 360° 均匀发射 N 条射线
const N = 60  // 射线数量
for (let i = 0; i < N; i++) {
  const azimuth = (i / N) * TWO_PI
  const dirEnu = [cos(azimuth), sin(azimuth), 0]
  const dirWorld = ENU_Matrix * dirEnu  // 转世界坐标

  // ② 沿射线步进采样，找到首个遮挡点
  for (let dist = step; dist <= maxDist; dist += step) {
    const samplePos = obsPos + dirWorld * dist
    const terrainH = sampleTerrainMostDetailed(samplePos)
    if (terrainH > obsHeight) → 被遮挡，记录边界点
  }
}

// ③ 边界点连接成多边形 = 可视域
viewer.entities.add({
  polygon: {
    hierarchy: new PolygonHierarchy(boundaryPoints),
    material: Color.GREEN.withAlpha(0.3),
    heightReference: HeightReference.CLAMP_TO_GROUND,
  },
})`,
};

const explainMap: Record<string, () => string> = {
  analyze: () => `【原理】可视域分析 = 射线法 + 地形采样：
1. 以观察点为中心，向 360° 方向均匀发射 N 条射线
2. 每条射线沿方向步进采样（stepDist 米），获取地形高程
3. 比较地形高程与视线高度：地形 > 视线 → 被遮挡，记录可视边界
4. 所有方向的可视边界点连接成多边形，即为可视域范围
5. 绿色半透明填充 = 可视区域，白色细线 = 射线边界

【API】
• sampleTerrainMostDetailed：高精度地形采样（异步）
• Transforms.eastNorthUpToFixedFrame：本地 ENU 坐标系
• Matrix4.multiplyByPointAsVector：方向向量坐标转换
• PolygonHierarchy：多边形层级（用于构建复杂多边形）

【参数】
• 观察点高度：人眼/摄像头离地面高度
• 最大视距：射线最远采样距离
• 射线数量：360° 均匀分布的射线数（越多越精确，越慢）

【要点】这是 CPU 射线法，精度取决于射线数量和步进距离；
大规模可视域建议用 GPU 着色器实现（深度缓冲 + 视锥体剔除）。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button
        size="small"
        :type="activeFeature === 'analyze' ? 'primary' : 'default'"
        @click="applySetObserver"
        >设置观察点</n-button
      >
      <n-button size="small" type="success" @click="applyCalculate">计算可视域</n-button>
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
      <div class="flex items-center gap-2 ml-2">
        <span class="text-xs text-gray-500">观察高度(m)</span>
        <n-input-number v-model:value="observerHeight" :min="1" :max="500" :step="10" size="small" style="width: 90px" />
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500">视距(m)</span>
        <n-input-number v-model:value="maxDistance" :min="500" :max="10000" :step="500" size="small" style="width: 100px" />
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500">射线数</span>
        <n-input-number v-model:value="rayCount" :min="12" :max="120" :step="12" size="small" style="width: 90px" />
      </div>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="viewshed-split"
    >
      <template #scene-overlay>
        <div
          class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white"
        >
          {{ statusText }}
        </div>
      </template>
    </SplitViewer>
  </div>
</template>
