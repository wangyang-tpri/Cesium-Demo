<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, ref, provide } from "vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";
import SplitViewer from "@/components/base/SplitViewer.vue";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref("start");
const statusText = ref("相机沿样条路径飞行漫游（Camera + CatmullRomSpline）。");

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-img",
  camera: { position: [108.94, 34.34, 12000], pitch: -60 },
  clock: {
    start: Cesium.JulianDate.fromIso8601("2026-01-01T00:00:00Z"),
    stop: Cesium.JulianDate.fromIso8601("2026-01-01T00:10:00Z"),
    currentTime: Cesium.JulianDate.fromIso8601("2026-01-01T00:00:00Z"),
    multiplier: 20,
    shouldAnimate: false,
    range: Cesium.ClockRange.LOOP_STOP,
  },
  onTick: (v, time) => {
    if (!running.value) return;
    const totalSec = 20; // 一圈 20 秒
    const t =
      (Cesium.JulianDate.secondsDifference(
        time,
        Cesium.JulianDate.fromIso8601("2026-01-01T00:00:00Z")
      ) %
        totalSec) /
      totalSec;
    const pos = spline.evaluate(t);
    // 前进方向上的下一点
    const next = spline.evaluate(Math.min(t + 0.03, 1));
    const enu = localToEnu(pos, next);

    const heading = Math.atan2(enu.x, enu.y); // 相对正北
    const pitch = Cesium.Math.toRadians(-8); // 略俯视
    v.camera.setView({
      destination: pos,
      orientation: {
        heading,
        pitch,
        roll: 0,
      },
    });
    // 飞行器图标跟随
    if (aircraft)
      (aircraft.position as Cesium.ConstantPositionProperty).setValue(pos);
  },
});

const startTime = Cesium.JulianDate.fromIso8601("2026-01-01T00:00:00Z");

/** 路径关键点（绕西安城区一圈，高度 800m） */
const WAYPOINTS: [number, number, number][] = [
  [108.88, 34.3, 900],
  [108.92, 34.335, 900],
  [108.94, 34.365, 900],
  [108.97, 34.36, 900],
  [109.0, 34.335, 900],
  [108.99, 34.3, 900],
  [108.94, 34.285, 900],
  [108.88, 34.3, 900],
];

const points = WAYPOINTS.map((w) => Cesium.Cartesian3.fromDegrees(...w));
const times = WAYPOINTS.map((_, i) => i / (WAYPOINTS.length - 1));

const spline = new Cesium.CatmullRomSpline({ times, points });

const running = ref(false);
let pathLine: Cesium.Entity | null = null;
let aircraft: Cesium.Entity | null = null;
const speedLevel = ref(1);

function localToEnu(
  origin: Cesium.Cartesian3,
  target: Cesium.Cartesian3
): Cesium.Cartesian3 {
  const m = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
  const inv = Cesium.Matrix4.inverseTransformation(m, new Cesium.Matrix4());
  return Cesium.Matrix4.multiplyByPoint(inv, target, new Cesium.Cartesian3());
}

function ensureVisuals() {
  const v = viewer.value;
  if (!v) return;
  if (!pathLine) {
    pathLine = v.entities.add({
      polyline: {
        positions: points,
        width: 3,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.3,
          color: Cesium.Color.fromCssColorString("#00d2ff"),
        }),
      },
    });
  }
  if (!aircraft) {
    aircraft = v.entities.add({
      position: points[0],
      billboard: {
        image: Cesium.buildModuleUrl("Assets/Textures/maki/airport.png"),
        scale: 1.2,
        color: Cesium.Color.YELLOW,
      },
    });
  }
}

function applyStart() {
  activeFeature.value = "start";
  ensureVisuals();
  const v = viewer.value;
  if (!v) return;
  running.value = true;
  v.clock.currentTime = startTime;
  v.clock.shouldAnimate = true;
  statusText.value = "▶ 漫游开始：相机沿样条路径飞行（CatmullRomSpline）";
}

function applyPause() {
  activeFeature.value = "start";
  const v = viewer.value;
  if (!v) return;
  running.value = !running.value;
  if (!running.value) v.clock.shouldAnimate = false;
  statusText.value = running.value ? "继续漫游" : "⏸ 漫游暂停";
}

function applySpeed() {
  activeFeature.value = "start";
  const v = viewer.value;
  if (!v) return;
  speedLevel.value = speedLevel.value >= 4 ? 1 : speedLevel.value + 1;
  v.clock.multiplier = speedLevel.value * 20;
  if (!running.value) {
    running.value = true;
    v.clock.shouldAnimate = true;
  }
  statusText.value = `速度 ${speedLevel.value}x（clock.multiplier = ${v.clock.multiplier}）`;
}

function applyReset() {
  activeFeature.value = "start";
  running.value = false;
  const v = viewer.value;
  if (!v) return;
  v.clock.shouldAnimate = false;
  v.clock.currentTime = startTime;
  v.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(108.94, 34.34, 12000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-60), roll: 0 },
    duration: 1,
  });
  statusText.value = "已重置";
}

onMounted(ensureVisuals);

const codeMap: Record<string, () => string> = {
  start: () => `// ① 构建样条路径
const points = waypoints.map(w =>
  Cesium.Cartesian3.fromDegrees(...w))   // 途经点
const times = points.map((_, i) => i / (points.length - 1))
const spline = new Cesium.CatmullRomSpline({ times, points })

// ② 每帧：t 时刻位置 + 朝向 + 相机跟随
viewer.clock.onTick.addEventListener((time) => {
  const t = (elapsedSec % totalSec) / totalSec
  const pos = spline.evaluate(t)          // 当前位置
  const next = spline.evaluate(Math.min(t + 0.03, 1))

  // 计算朝向：把前进方向投影到本地 ENU
  const enu = toLocalEnu(pos, next)
  const heading = Math.atan2(enu.x, enu.y)

  viewer.camera.setView({
    destination: pos,
    orientation: { heading, pitch: -8°, roll: 0 },
  })
})`,
};

const explainMap: Record<string, () => string> = {
  start: () => `【原理】飞行漫游 = 样条插值（轨迹）+ 每帧相机跟随（视角）：
1. CatmullRomSpline：对途经点做平滑插值，得到连续路径
2. t 在 [0,1] 推进（由 clock 时间驱动，可倍速/暂停）
3. 朝向 = 当前位置指向下一点的方向在“东-北-上”局部系的投影
   （Math.atan2(east, north) 即相对正北的 heading）
4. camera.setView 每帧写入相机状态

【要点】spline.evaluate(t) 支持任意 t 时刻取点，配合
clock.multiplier 实现变速；可扩展为“第一人称/第三人称”视角。`,
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
        :type="activeFeature === 'start' ? 'primary' : 'default'"
        @click="applyStart"
        >开始漫游</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'start' ? 'primary' : 'default'"
        @click="applyPause"
        >{{ running ? "暂停" : "继续" }}</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'start' ? 'primary' : 'default'"
        @click="applySpeed"
        >速度 {{ speedLevel }}x</n-button
      >
      <n-button size="small" quaternary @click="applyReset">重置视角</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="flight-split"
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
