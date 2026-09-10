<script setup lang="ts">
import * as Cesium from "cesium";
import { ref, provide } from "vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";
import SplitViewer from "@/components/base/SplitViewer.vue";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref("analyze");
const statusText = ref("通视分析：依次点击观察点和目标点，自动计算视线遮挡情况。");

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-img",
  camera: { position: [108.94, 34.2, 30000], pitch: -55 },
});

type PointType = "observer" | "target" | null;
let currentPick: PointType = null;
let observerPos: Cesium.Cartesian3 | null = null;
let targetPos: Cesium.Cartesian3 | null = null;

let observerEntity: Cesium.Entity | null = null;
let targetEntity: Cesium.Entity | null = null;
let visibleLine: Cesium.Entity | null = null;
let blockedLine: Cesium.Entity | null = null;
let blockPointEntity: Cesium.Entity | null = null;

let handler: Cesium.ScreenSpaceEventHandler | null = null;

function clearAll() {
  const v = viewer.value;
  if (!v) return;
  for (const e of [observerEntity, targetEntity, visibleLine, blockedLine, blockPointEntity]) {
    if (e) v.entities.remove(e);
  }
  observerEntity = targetEntity = visibleLine = blockedLine = blockPointEntity = null;
  observerPos = targetPos = null;
}

function pickPoint(windowPos: Cesium.Cartesian2): Cesium.Cartesian3 | null {
  const v = viewer.value;
  if (!v) return null;
  // 优先拾取地形
  const ray = v.camera.getPickRay(windowPos);
  if (!ray) return null;
  const cartesian = v.scene.globe.pick(ray, v.scene);
  return cartesian || null;
}

function startPick(type: PointType) {
  clearAll();
  currentPick = type;
  statusText.value = type === "observer"
    ? "请在地图上点击观察点..."
    : "请在地图上点击目标点...";
  if (!handler) {
    const v = viewer.value!;
    handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
    handler.setInputAction((click: any) => {
      if (!currentPick) return;
      const pos = pickPoint(click.position);
      if (!pos) return;
      if (currentPick === "observer") {
        observerPos = pos;
        observerEntity = viewer.value!.entities.add({
          position: pos,
          point: { pixelSize: 12, color: Cesium.Color.GREEN, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
          label: { text: "观察点", font: "14px sans-serif", pixelOffset: new Cesium.Cartesian2(0, -25), fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE },
        });
        currentPick = "target";
        statusText.value = "观察点已设置，请点击目标点...";
      } else if (currentPick === "target") {
        targetPos = pos;
        targetEntity = viewer.value!.entities.add({
          position: pos,
          point: { pixelSize: 12, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
          label: { text: "目标点", font: "14px sans-serif", pixelOffset: new Cesium.Cartesian2(0, -25), fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE },
        });
        currentPick = null;
        analyzeLineOfSight();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }
}

async function analyzeLineOfSight() {
  const v = viewer.value;
  if (!v || !observerPos || !targetPos) return;
  statusText.value = "正在采样地形高程，计算通视情况...";

  // 在两点连线上采样 100 个点
  const SAMPLES = 100;
  const cartographics: Cesium.Cartographic[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const pos = Cesium.Cartesian3.lerp(observerPos, targetPos, t, new Cesium.Cartesian3());
    cartographics.push(Cesium.Cartographic.fromCartesian(pos));
  }

  // 采样地形高程（使用高精度地形）
  const terrainProvider = v.terrainProvider;
  const updatedPositions = await Cesium.sampleTerrainMostDetailed(terrainProvider, cartographics);

  // 获取观察点和目标点的高程
  const obsCarto = Cesium.Cartographic.fromCartesian(observerPos);
  const tgtCarto = Cesium.Cartographic.fromCartesian(targetPos);
  const obsHeight = obsCarto.height + 2; // 观察点高度 +2m 人眼高度
  const tgtHeight = tgtCarto.height + 2;

  // 计算视线直线方程，判断每个采样点是否被遮挡
  let blockIndex = -1;
  const visiblePoints: Cesium.Cartesian3[] = [];
  const blockedPoints: Cesium.Cartesian3[] = [];

  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const terrainHeight = updatedPositions[i]?.height ?? 0;
    // 视线在该点的高度（线性插值）
    const lineHeight = obsHeight + (tgtHeight - obsHeight) * t;
    const pos = Cesium.Cartographic.toCartesian(updatedPositions[i]);

    if (terrainHeight > lineHeight + 0.5) {
      // 地形高于视线，被遮挡
      if (blockIndex === -1) blockIndex = i;
      blockedPoints.push(pos);
    } else {
      visiblePoints.push(pos);
    }
  }

  // 绘制可视线段（绿色）和遮挡线段（红色）
  if (visiblePoints.length > 1) {
    visibleLine = v.entities.add({
      polyline: { positions: visiblePoints, width: 4, material: Cesium.Color.GREEN.withAlpha(0.8) },
    });
  }
  if (blockedPoints.length > 1) {
    blockedLine = v.entities.add({
      polyline: { positions: blockedPoints, width: 4, material: Cesium.Color.RED.withAlpha(0.8) },
    });
  }

  // 标记首个遮挡点
  if (blockIndex >= 0 && updatedPositions[blockIndex]) {
    const blockPos = Cesium.Cartographic.toCartesian(updatedPositions[blockIndex]);
    blockPointEntity = v.entities.add({
      position: blockPos,
      point: { pixelSize: 14, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
      label: { text: "遮挡点", font: "14px sans-serif", pixelOffset: new Cesium.Cartesian2(0, -25), fillColor: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE },
    });
  }

  const visible = blockIndex === -1;
  statusText.value = visible
    ? `✅ 通视：两点之间完全可视（采样 ${SAMPLES} 个点，无遮挡）`
    : `❌ 不通视：第 ${blockIndex}/${SAMPLES} 个采样点处首次被遮挡（绿色=可视，红色=遮挡）`;
}

function applyAnalyze() {
  activeFeature.value = "analyze";
  startPick("observer");
}

function applyClear() {
  activeFeature.value = "analyze";
  clearAll();
  statusText.value = "已清除，点击「开始分析」重新选择观察点和目标点。";
}

const codeMap: Record<string, () => string> = {
  analyze: () => `// ① 两点连线采样
const SAMPLES = 100
for (let i = 0; i <= SAMPLES; i++) {
  const t = i / SAMPLES
  const pos = Cartesian3.lerp(observer, target, t)
  cartographics.push(Cartographic.fromCartesian(pos))
}

// ② 高精度地形采样
const positions = await sampleTerrainMostDetailed(
  terrainProvider, cartographics)

// ③ 视线遮挡判断
for (let i = 0; i <= SAMPLES; i++) {
  const t = i / SAMPLES
  const terrainH = positions[i].height
  const lineH = obsH + (tgtH - obsH) * t  // 视线线性插值
  if (terrainH > lineH) → 被遮挡
}

// ④ 可视化：绿色=可视，红色=遮挡，黄色=首个遮挡点`,
};

const explainMap: Record<string, () => string> = {
  analyze: () => `【原理】通视分析 = 地形采样 + 视线求交：
1. 在观察点和目标点连线上均匀采样 N 个点
2. sampleTerrainMostDetailed 获取每个点的地形高程（高精度）
3. 视线是观察点到目标点的空间直线，在采样点处线性插值得到视线高度
4. 比较地形高度与视线高度：地形 > 视线 → 被遮挡
5. 找到首个遮挡点，即可判断通视/不通视

【API】
• sampleTerrainMostDetailed：高精度地形采样（异步，返回 Promise）
• sampleTerrain：指定层级的地形采样（更快，精度较低）
• Cartesian3.lerp：两点线性插值

【要点】观察点/目标点需加人眼高度（+2m）；
地形采样是异步的，需 await；采样点越多精度越高但越慢。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button
        size="small"
        :type="activeFeature === 'analyze' ? 'primary' : 'default'"
        @click="applyAnalyze"
        >开始分析</n-button
      >
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="los-split"
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
