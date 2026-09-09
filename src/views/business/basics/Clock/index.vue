<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, ref, provide, watch } from "vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";
import SplitViewer from "@/components/base/SplitViewer.vue";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref("clock-basic");
const statusText = ref(
  "时钟已初始化：模拟时间从 00:00 到 24:00，1 秒 = 60 秒模拟时间"
);

const start = Cesium.JulianDate.fromIso8601("2026-01-01T00:00:00Z");
const stop = Cesium.JulianDate.fromIso8601("2026-01-02T00:00:00Z");

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-img",
  camera: { position: [108.94, 34.34, 800000], pitch: -55 },
  ui: { animation: true, timeline: true },
  clock: {
    start,
    stop,
    currentTime: start,
    multiplier: 60,
    shouldAnimate: true,
    range: Cesium.ClockRange.LOOP_STOP,
  },
});

// viewer 就绪后立即添加卫星和轨道线，确保时钟运行时卫星立即运动
// （SplitViewer 容器延迟就绪，onMounted 时 viewer 可能还未初始化）
watch(viewer, (v) => {
  if (v) ensureOrbit();
});

// 分割条拖拽时通知 viewer 重新计算渲染尺寸
function onSplitChange() {
  viewer.value?.resize();
}

let orbitEntity: Cesium.Entity | null = null;
let orbitLine: Cesium.Entity | null = null;

const SPEED_LABELS = ["1x 实时", "60x 分钟级", "600x 十分钟级", "3600x 小时级"];
const SPEEDS = [1, 60, 600, 3600];
const speedIndex = ref(1);

function ensureOrbit() {
  const v = viewer.value;
  if (!v || orbitEntity) return;

  // 卫星位置随时间变化：绕西安上空一圈（周期 24h）
  orbitEntity = v.entities.add({
    id: "satellite",
    position: new Cesium.CallbackProperty((time) => {
      // 1.145：回调的 time 参数可选，需兜底
      const t =
        Cesium.JulianDate.secondsDifference(
          time ?? Cesium.JulianDate.now(),
          start
        ) / 86400; // 0~1
      const angle = t * Cesium.Math.TWO_PI;
      return Cesium.Cartesian3.fromDegrees(
        108.94 + Math.cos(angle) * 0.5,
        34.34 + Math.sin(angle) * 0.35,
        200000 + Math.sin(angle * 2) * 50000
      );
    }, false) as unknown as Cesium.PositionProperty,
    point: {
      pixelSize: 14,
      color: Cesium.Color.RED,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
    },
    label: {
      text: "卫星",
      font: "13px Microsoft YaHei, sans-serif",
      pixelOffset: new Cesium.Cartesian2(0, -26),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    },
  });

  // 轨道线（静态路径）
  orbitLine = v.entities.add({
    polyline: {
      positions: Array.from({ length: 121 }, (_, i) => {
        const a = (i / 120) * Cesium.Math.TWO_PI;
        return Cesium.Cartesian3.fromDegrees(
          108.94 + Math.cos(a) * 0.5,
          34.34 + Math.sin(a) * 0.35,
          200000
        );
      }),
      width: 2,
      material: Cesium.Color.WHITE.withAlpha(0.4),
    },
  });
}

function applyAnimate() {
  activeFeature.value = "animate";
  ensureOrbit();
  const v = viewer.value;
  if (!v) return;
  v.clock.shouldAnimate = !v.clock.shouldAnimate;
  statusText.value = v.clock.shouldAnimate
    ? "▶ 动画播放中（卫星沿轨道运动）"
    : "⏸ 动画已暂停";
}

function applySpeed() {
  activeFeature.value = "speed";
  ensureOrbit();
  const v = viewer.value;
  if (!v) return;
  speedIndex.value = (speedIndex.value + 1) % SPEEDS.length;
  v.clock.multiplier = SPEEDS[speedIndex.value]!;
  v.clock.shouldAnimate = true;
  statusText.value = `倍速：${
    SPEED_LABELS[speedIndex.value]
  }（multiplier = ${SPEEDS[speedIndex.value]!}）`;
}

function applyTimeJump() {
  activeFeature.value = "clock-basic";
  const v = viewer.value;
  if (!v) return;
  // 直接设置当前时间（跳到中午 12:00）
  v.clock.currentTime = Cesium.JulianDate.fromIso8601("2026-01-01T12:00:00Z");
  statusText.value = "模拟时间已跳转到 12:00（观察卫星位置与时间轴指针）";
}

function applyShowClockInfo() {
  activeFeature.value = "clock-basic";
  const v = viewer.value;
  if (!v) return;
  const t = v.clock.currentTime;
  const iso = Cesium.JulianDate.toIso8601(t);
  statusText.value = `当前模拟时间：${iso}（multiplier=${v.clock.multiplier}，${
    v.clock.shouldAnimate ? "播放中" : "暂停"
  }`;
}

const codeMap: Record<string, () => string> = {
  "clock-basic": () => `// ① 时钟初始化
const start = Cesium.JulianDate.fromIso8601('2026-01-01T00:00:00Z')
const stop  = Cesium.JulianDate.fromIso8601('2026-01-02T00:00:00Z')

const viewer = new Cesium.Viewer('cesiumContainer', {
  animation: true,   // 显示动画控件（播放/暂停/倍速）
  timeline:  true,   // 显示时间轴
  shouldAnimate: true,
})
viewer.clock.startTime   = start
viewer.clock.stopTime    = stop
viewer.clock.currentTime = start
viewer.clock.multiplier  = 60   // 1 真实秒 = 60 模拟秒
viewer.clock.clockRange  = Cesium.ClockRange.LOOP_STOP // 循环`,

  animate: () => `// ② 播放 / 暂停
viewer.clock.shouldAnimate = true   // 播放
viewer.clock.shouldAnimate = false  // 暂停
// ★ 动画控件上的按钮本质就是切换该属性`,

  speed: () => `// ③ 倍速控制
viewer.clock.multiplier = 60    // 1 秒 = 1 分钟
viewer.clock.multiplier = 3600  // 1 秒 = 1 小时
// ★ 修改后立即生效，时间轴刻度同步缩放`,

  dynamic: () => `// ④ 时间驱动实体：位置随时间变化
entity.position = new Cesium.CallbackProperty((time) => {
  // time = viewer.clock.currentTime
  const t = Cesium.JulianDate.secondsDifference(
    time, start) / 86400       // 0~1 天
  const angle = t * Cesium.Math.TWO_PI
  return Cesium.Cartesian3.fromDegrees(
    centerLon + Math.cos(angle) * 0.5,
    centerLat + Math.sin(angle) * 0.35,
    200000)
}, false)

// ★ CallbackProperty 每次渲染帧调用 → 位置自然“动”起来`,
};

const explainMap: Record<string, () => string> = {
  "clock-basic": () => `【原理】Clock 是 Cesium 的“模拟时间引擎”：
• currentTime：当前模拟时刻（JulianDate 儒略日）
• multiplier：时间倍速（1 真实秒前进多少模拟秒）
• clockRange：LOOP_STOP 循环 / CLAMPED 到点停止 / UNBOUNDED 不限
• shouldAnimate：是否前进

【控件】Animation 控件（播放/暂停/倍速按钮）+ Timeline（可拖动的时间轴）
直接操作 ClockViewModel → Clock。

【要点】所有时间动态对象（卫星、飞机、日出日落）都读取 clock.currentTime。`,

  animate: () => `【原理】shouldAnimate 是播放开关，动画控件上的 ▶/⏸ 按钮
本质就是切换它。tick 事件在每次模拟时间前进时触发。

【要点】配合 requestRenderMode 可做按需渲染优化。`,

  speed: () => `【原理】multiplier > 0 正向播放，< 0 倒放。
时间轴（Timeline）会随 multiplier 自动调整刻度密度。

【要点】演示 24h 轨道：60x 下约 24 分钟走完一天；
3600x 下 24 秒走完一天，适合快速演示。`,

  dynamic: () => `【原理】CallbackProperty 是“惰性求值”的属性：每次渲染时
调用函数取当前值，天然随时间变化。
更专业的做法（推荐）：
• SampledPositionProperty：采样关键帧，内部插值（见“轨迹模拟”页）
• VelocityOrientationProperty：根据位置自动计算朝向

【观察】点开“播放/暂停”，卫星沿椭圆轨道运动，轨迹白线为静态参考。`,
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
        :type="activeFeature === 'animate' ? 'primary' : 'default'"
        @click="applyAnimate"
        >播放 / 暂停</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'speed' ? 'primary' : 'default'"
        @click="applySpeed"
        >倍速：{{ SPEED_LABELS[speedIndex] }}</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'clock-basic' ? 'primary' : 'default'"
        @click="applyTimeJump"
        >跳到 12:00</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'clock-basic' ? 'primary' : 'default'"
        @click="applyShowClockInfo"
        >读取模拟时间</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'dynamic' ? 'primary' : 'default'"
        @click="
          activeFeature = 'dynamic';
          ensureOrbit();
        "
        >查看时间驱动实体</n-button
      >
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="clock-split"
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
