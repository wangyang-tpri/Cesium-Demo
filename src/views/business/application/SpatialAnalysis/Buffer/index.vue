<script setup lang="ts">
import * as Cesium from "cesium";
import { ref, provide } from "vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";
import SplitViewer from "@/components/base/SplitViewer.vue";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref("point");
const statusText = ref("缓冲区分析：选择点/线模式，在地图上点击添加要素，设置半径后生成缓冲区。");

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-vec",
  camera: { position: [108.94, 34.34, 20000], pitch: -55 },
});

type Mode = "point" | "line";
const mode = ref<Mode>("point");
const bufferRadius = ref(500); // 缓冲区半径（米）

let picking = false;
let points: Cesium.Cartesian3[] = [];
let featureEntities: Cesium.Entity[] = [];
let bufferEntities: Cesium.Entity[] = [];
let tempLineEntity: Cesium.Entity | null = null;
let handler: Cesium.ScreenSpaceEventHandler | null = null;

function clearAll() {
  const v = viewer.value;
  if (!v) return;
  for (const e of featureEntities) v.entities.remove(e);
  for (const e of bufferEntities) v.entities.remove(e);
  featureEntities = [];
  bufferEntities = [];
  if (tempLineEntity) { v.entities.remove(tempLineEntity); tempLineEntity = null; }
  points = [];
}

function pickPoint(windowPos: Cesium.Cartesian2): Cesium.Cartesian3 | null {
  const v = viewer.value;
  if (!v) return null;
  const ray = v.camera.getPickRay(windowPos);
  if (!ray) return null;
  return v.scene.globe.pick(ray, v.scene) || null;
}

function setMode(m: Mode) {
  mode.value = m;
  activeFeature.value = m;
  clearAll();
  picking = false;
  statusText.value = m === "point"
    ? "点缓冲区模式：点击「开始绘制」，然后在地图上点击添加点要素"
    : "线缓冲区模式：点击「开始绘制」，然后在地图上点击添加线顶点";
}

function startPicking() {
  clearAll();
  picking = true;
  statusText.value = mode.value === "point"
    ? "请在地图上点击添加点要素，点击「生成缓冲区」完成"
    : "请在地图上点击添加线顶点（至少2个点），点击「生成缓冲区」完成";
  if (!handler) {
    const v = viewer.value!;
    handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
    handler.setInputAction((click: any) => {
      if (!picking) return;
      const pos = pickPoint(click.position);
      if (!pos) return;
      points.push(pos);
      const entity = v.entities.add({
        position: pos,
        point: { pixelSize: 10, color: mode.value === "point" ? Cesium.Color.fromCssColorString("#f0a020") : Cesium.Color.fromCssColorString("#2080f0"), outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
      });
      featureEntities.push(entity);
      // 线模式：更新临时连线
      if (mode.value === "line" && points.length >= 2) {
        if (tempLineEntity) v.entities.remove(tempLineEntity);
        tempLineEntity = v.entities.add({
          polyline: { positions: [...points], width: 3, material: Cesium.Color.fromCssColorString("#2080f0") },
        });
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }
}

function generateBuffer() {
  if (points.length === 0) {
    statusText.value = "⚠ 请先添加要素点";
    return;
  }
  if (mode.value === "line" && points.length < 2) {
    statusText.value = "⚠ 线缓冲区至少需要 2 个点";
    return;
  }
  picking = false;
  const v = viewer.value;
  if (!v) return;

  // 清除旧的缓冲区
  for (const e of bufferEntities) v.entities.remove(e);
  bufferEntities = [];

  const radius = bufferRadius.value;

  if (mode.value === "point") {
    // 点缓冲区：对每个点生成圆形缓冲区
    for (const pos of points) {
      const carto = Cesium.Cartographic.fromCartesian(pos);
      const buffer = v.entities.add({
        position: pos,
        ellipse: {
          semiMinorAxis: radius,
          semiMajorAxis: radius,
          material: Cesium.Color.fromCssColorString("#f0a020").withAlpha(0.35),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#f0a020"),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      bufferEntities.push(buffer);
    }
    statusText.value = `✅ 点缓冲区生成完成：${points.length} 个点，半径 ${radius}m`;
  } else {
    // 线缓冲区：用 CorridorGeometry 生成带状缓冲区
    const corridor = v.entities.add({
      corridor: {
        positions: points,
        width: radius * 2, // 走廊宽度 = 半径 * 2
        material: Cesium.Color.fromCssColorString("#2080f0").withAlpha(0.35),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#2080f0"),
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
    bufferEntities.push(corridor);

    // 同时保留线要素
    if (tempLineEntity) v.entities.remove(tempLineEntity);
    const line = v.entities.add({
      polyline: { positions: points, width: 3, material: Cesium.Color.fromCssColorString("#2080f0") },
    });
    featureEntities.push(line);

    statusText.value = `✅ 线缓冲区生成完成：${points.length - 1} 段线，宽度 ${radius * 2}m（半径 ${radius}m）`;
  }
}

function applyPointMode() { setMode("point"); }
function applyLineMode() { setMode("line"); }
function applyStart() {
  activeFeature.value = mode.value;
  startPicking();
}
function applyGenerate() {
  activeFeature.value = mode.value;
  generateBuffer();
}
function applyClear() {
  activeFeature.value = mode.value;
  picking = false;
  clearAll();
  statusText.value = "已清除，点击「开始绘制」重新添加要素。";
}

const codeMap: Record<string, () => string> = {
  point: () => `// 点缓冲区：ellipse 生成圆形区域
viewer.entities.add({
  position: pointPos,
  ellipse: {
    semiMinorAxis: radius,
    semiMajorAxis: radius,
    material: Color.ORANGE.withAlpha(0.35),
    outline: true,
    outlineColor: Color.ORANGE,
    heightReference: HeightReference.CLAMP_TO_GROUND,
  },
})

// 对线的每个顶点都生成圆形缓冲区`,
  line: () => `// 线缓冲区：corridor 生成带状区域
viewer.entities.add({
  corridor: {
    positions: linePoints,    // 折线顶点
    width: radius * 2,         // 走廊宽度 = 缓冲区半径 * 2
    material: Color.BLUE.withAlpha(0.35),
    outline: true,
    outlineColor: Color.BLUE,
    heightReference: HeightReference.CLAMP_TO_GROUND,
  },
})

// CorridorGeometry 内部会计算线两侧的平行线，
// 并在端点处生成半圆形封口，形成完整的缓冲区多边形`,
};

const explainMap: Record<string, () => string> = {
  point: () => `【原理】点缓冲区 = 圆形区域：
1. 以点要素为中心，指定半径生成圆形区域
2. Cesium 用 Entity.ellipse 实现（semiMinorAxis = semiMajorAxis = 半径）
3. heightReference: CLAMP_TO_GROUND 让缓冲区贴地
4. 半透明填充 + 边框，可视化缓冲区范围

【API】
• Entity.ellipse：椭圆/圆形区域
• semiMinorAxis / semiMajorAxis：短半轴/长半轴（相等即为圆）
• HeightReference.CLAMP_TO_GROUND：贴地渲染

【要点】半径单位是米；多个点缓冲区可叠加显示；
可用于学校辐射范围、站点服务范围等分析。`,
  line: () => `【原理】线缓冲区 = 带状区域：
1. 以线要素为中心线，指定半径生成两侧等宽的带状区域
2. Cesium 用 Entity.corridor 实现（CorridorGeometry）
3. corridor.width = 缓冲区半径 * 2（总宽度）
4. 内部自动计算线两侧平行线，并在端点处生成半圆形封口

【API】
• Entity.corridor：走廊/带状区域
• corridor.positions：折线顶点
• corridor.width：走廊总宽度（米）
• HeightReference.CLAMP_TO_GROUND：贴地渲染

【要点】corridor 会自动处理折线拐角和端点封口；
可用于道路沿线影响范围、河流两岸保护区等分析。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button
        size="small"
        :type="mode === 'point' ? 'primary' : 'default'"
        @click="applyPointMode"
        >点缓冲区</n-button
      >
      <n-button
        size="small"
        :type="mode === 'line' ? 'primary' : 'default'"
        @click="applyLineMode"
        >线缓冲区</n-button
      >
      <n-button size="small" type="success" @click="applyStart">开始绘制</n-button>
      <n-button size="small" type="warning" @click="applyGenerate">生成缓冲区</n-button>
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
      <div class="flex items-center gap-2 ml-2">
        <span class="text-xs text-gray-500">半径(m)</span>
        <n-input-number
          v-model:value="bufferRadius"
          :min="10"
          :max="5000"
          :step="100"
          size="small"
          style="width: 100px"
        />
      </div>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="buffer-split"
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
