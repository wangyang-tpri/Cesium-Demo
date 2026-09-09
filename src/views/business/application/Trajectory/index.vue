<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, ref, provide } from "vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";
import SplitViewer from "@/components/base/SplitViewer.vue";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref("load");
const statusText = ref(
  "轨迹模拟：SampledPositionProperty 采样 + 速度朝向 + 时间轴联动。"
);

const TRAJ_START = Cesium.JulianDate.fromIso8601("2026-01-01T00:00:00Z");
const TRAJ_STOP = Cesium.JulianDate.fromIso8601("2026-01-01T00:10:00Z");

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-img",
  camera: { position: [108.94, 33.88, 90000], pitch: -60 },
  ui: { animation: true, timeline: true },
  clock: {
    start: TRAJ_START,
    stop: TRAJ_STOP,
    currentTime: TRAJ_START,
    multiplier: 60,
    shouldAnimate: false,
    range: Cesium.ClockRange.LOOP_STOP,
  },
  onTick: (v, time) => {
    if (!following.value || !craft) return;
    // 跟随视角：相机保持固定相对偏移看模型
    const pos = craft.position?.getValue(time);
    if (pos) {
      const carto = Cesium.Cartographic.fromCartesian(pos);
      v.camera.lookAt(
        pos,
        new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(180), // 从运动反方向看（正后方）
          Cesium.Math.toRadians(-25),
          3000
        )
      );
    }
  },
});

const following = ref(false);
const speedIndex = ref(2);

let craft: Cesium.Entity | null = null;
let pathEntity: Cesium.Entity | null = null;
let built = false;

/** 生成 10 分钟绕行轨迹（程序化采样），并返回采样点数组供轨迹线使用 */
function buildTrajectory(): {
  position: Cesium.SampledPositionProperty;
  samples: Cesium.Cartesian3[];
} {
  const position = new Cesium.SampledPositionProperty();
  const samples: Cesium.Cartesian3[] = [];
  const steps = 50;
  for (let i = 0; i <= steps; i++) {
    const t = Cesium.JulianDate.addSeconds(
      TRAJ_START,
      (i / steps) * 600,
      new Cesium.JulianDate()
    );
    const a = (i / steps) * Cesium.Math.TWO_PI;
    const p = Cesium.Cartesian3.fromDegrees(
      108.94 + Math.cos(a) * 0.45,
      34.34 + Math.sin(a) * 0.3,
      6000 + Math.sin(a * 3) * 1500 // 高度起伏
    );
    position.addSample(t, p);
    samples.push(p);
  }
  return { position, samples };
}

function buildCraft() {
  const v = viewer.value;
  if (!v || built) return;
  const { position, samples } = buildTrajectory();

  // 轨迹线（全路径可视化）—— 蓝色虚线
  if (samples.length) {
    pathEntity = v.entities.add({
      polyline: {
        positions: samples,
        width: 6,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString("#409eff"),
          dashLength: 16,
        }),
      },
    });
  }

  // 飞行器：锥形柱体 + 朝向自动对齐速度方向
  craft = v.entities.add({
    position,
    orientation: new Cesium.VelocityOrientationProperty(position),
    cylinder: {
      length: 400,
      topRadius: 0, // 锥体（火箭）
      bottomRadius: 80,
      material: Cesium.Color.fromCssColorString("#ff9f43"),
      outline: true,
      outlineColor: Cesium.Color.WHITE,
    },
    point: {
      pixelSize: 12,
      color: Cesium.Color.YELLOW,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
    },
    path: {
      resolution: 10,
      leadTime: 120, // 显示未来 2 分钟
      trailTime: 300, // 显示过去 5 分钟
      width: 6,
      material: Cesium.Color.fromCssColorString("#ff4757"),
    },
    label: {
      text: "飞行器",
      font: "14px Microsoft YaHei, sans-serif",
      pixelOffset: new Cesium.Cartesian2(0, -40),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    },
  });

  built = true;
}

function applyLoad() {
  activeFeature.value = "load";
  buildCraft();
  const v = viewer.value;
  if (!v) return;
  v.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(108.94, 34.34, 90000),
    duration: 1.5,
  });
  statusText.value = "轨迹已生成：50 个采样点 + 拉格朗日插值；点击 ▶ 开始运动";
}

function applyPlay() {
  activeFeature.value = "play";
  buildCraft();
  const v = viewer.value;
  if (!v) return;
  v.clock.shouldAnimate = !v.clock.shouldAnimate;
  statusText.value = v.clock.shouldAnimate
    ? "▶ 运动播放中（红色为实时轨迹，蓝色为全路径）"
    : "⏸ 已暂停";
}

function applySpeed() {
  activeFeature.value = "play";
  const v = viewer.value;
  if (!v) return;
  speedIndex.value = (speedIndex.value % 4) + 1;
  v.clock.multiplier = [10, 60, 300, 600][speedIndex.value - 1]!;
  statusText.value = `速度：1 真实秒 = ${v.clock.multiplier} 模拟秒`;
}

function applyFollow() {
  activeFeature.value = "look";
  buildCraft();
  const v = viewer.value;
  if (!v) return;
  following.value = !following.value;
  if (following.value) {
    if (!v.clock.shouldAnimate) v.clock.shouldAnimate = true;
    statusText.value = "跟随视角：相机锁定飞行器（lookAt 相对偏移）";
  } else {
    // 退出 lookAt：先恢复相机变换矩阵，再 flyTo 回初始全局视角
    v.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(108.94, 33.88, 90000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-60), roll: 0 },
      duration: 1.5,
    });
    statusText.value = "已退出跟随视角，相机飞回全局视角";
  }
}

function applyReset() {
  activeFeature.value = "load";
  following.value = false;
  const v = viewer.value;
  if (!v) return;
  v.clock.shouldAnimate = false;
  v.clock.currentTime = TRAJ_START;
  v.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(108.94, 34.34, 90000),
    duration: 1,
  });
  statusText.value = "已重置到起点";
}

onMounted(buildCraft);

const codeMap: Record<string, () => string> = {
  load: () => `// ① 采样轨迹：SampledPositionProperty
const position = new Cesium.SampledPositionProperty()
for (let i = 0; i <= 50; i++) {
  const t = Cesium.JulianDate.addSeconds(
    TRAJ_START, i * 12, new Cesium.JulianDate())
  position.addSample(t, fromDegrees(...))  // 采样点
}
// 默认拉格朗日插值 → 平滑运动

// ② 飞行器 + 轨迹
viewer.entities.add({
  position,
  orientation:
    new Cesium.VelocityOrientationProperty(position), // 自动朝向
  cylinder: { length: 400, topRadius: 0, bottomRadius: 80, ... },
  path: {   // 实时轨迹
    resolution: 10,
    leadTime: 120,   // 显示未来轨迹
    trailTime: 300,  // 显示过去轨迹
    width: 6,
    material: Color.RED,
  },
})`,
  play: () => `// ① 播放/暂停：控制时钟 shouldAnimate
viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate

// ② 倍速：clock.multiplier（1 真实秒 = N 模拟秒）
viewer.clock.multiplier = 60   // 60倍速
// 可选：10 / 60 / 300 / 600

// ③ 循环：ClockRange.LOOP_STOP
viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP
// 到达 stopTime 后自动回到 startTime

// ④ 时间轴联动：Entity.position 是 SampledPositionProperty
// clock 推进 → position.getValue(time) 插值 → 实体自动运动`,
  look: () => `// ① 进入跟随：camera.lookAt 锁定目标
const pos = craft.position.getValue(viewer.clock.currentTime)
viewer.camera.lookAt(
  pos,
  new Cesium.HeadingPitchRange(
    Cesium.Math.toRadians(180), // 从正后方看
    Cesium.Math.toRadians(-25), // 俯角
    3000                          // 距离
  )
)
// lookAt 会修改相机变换矩阵，相机被锁定到目标

// ② 每帧更新：onTick 中重新 lookAt
viewer.clock.onTick.addEventListener((time) => {
  const pos = craft.position.getValue(time)
  viewer.camera.lookAt(pos, offset)  // 持续跟随
})

// ③ 退出跟随：必须恢复变换矩阵 + 飞回自由视角
viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
viewer.camera.flyTo({ destination: initialPos, duration: 1.5 })
// 注意：只设 following=false 不够，必须调用 lookAtTransform`,
};

const explainMap: Record<string, () => string> = {
  load: () => `【原理】轨迹模拟三步走：
1. 采样：SampledPositionProperty 存 (时间, 位置) 关键帧
2. 插值：默认拉格朗日插值（可换样条/线性），任意时刻有位置
3. 联动：Entity.position 用该属性 + clock 驱动 → 自动运动

【配套】
• VelocityOrientationProperty：由位置自动推导速度方向（飞行器朝向）
• path：按时间渲染"过去/未来"轨迹（leadTime/trailTime 控制）
• path.resolution：轨迹采样分辨率（秒）

【要点】与"时钟"页的 CallbackProperty 方案相比，
采样方案数据可回放、可预测，是工程轨迹的标准做法。`,
  play: () => `【原理】播放控制 = 时钟驱动 + 位置属性插值：
1. clock.shouldAnimate：true=播放，false=暂停（时钟是否推进）
2. clock.multiplier：倍速，1 真实秒 = N 模拟秒（如 60 表示 60 倍速）
3. clock.clockRange：LOOP_STOP 到达终点后循环回起点
4. Entity.position 是 SampledPositionProperty，clock 推进时自动
   调用 getValue(currentTime) 插值得到当前位置 → 实体运动

【时间轴】底部 timeline 组件可拖拽/点击跳转到任意时刻，
与 clock.currentTime 双向绑定。

【要点】暂停只是停止时钟推进，实体位置保持在当前时刻，
不会消失；再次播放从暂停处继续。`,
  look: () => `【原理】跟随视角 = camera.lookAt 锁定目标 + 每帧更新：
1. camera.lookAt(target, HeadingPitchRange)：
   - target：锁定点（飞行器当前位置）
   - HeadingPitchRange：相对目标的朝向(heading)、俯仰(pitch)、距离(range)
   - 调用后相机会"粘"在目标上，目标移动相机跟随

2. 每帧更新：onTick 中重新调用 lookAt，因为目标位置随时间变化

3. 【关键坑】lookAt 会修改相机的变换矩阵（transform），
   退出时必须调用 camera.lookAtTransform(Matrix4.IDENTITY)
   恢复自由变换，否则相机会一直锁定目标，无法自由旋转/缩放。
   只设 following=false 是不够的！

4. 退出后可 flyTo 飞回全局视角，给用户平滑的过渡体验。

【扩展】HeadingPitchRange 的 heading=180° 表示从正后方看，
pitch=-25° 表示俯视 25°，range=3000 表示距离目标 3000 米。`,
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
        :type="activeFeature === 'load' ? 'primary' : 'default'"
        @click="applyLoad"
        >生成轨迹</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'play' ? 'primary' : 'default'"
        @click="applyPlay"
        >播放 / 暂停</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'play' ? 'primary' : 'default'"
        @click="applySpeed"
        >速度 {{ speedIndex }}/4</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'look' ? 'primary' : 'default'"
        @click="applyFollow"
        >{{ following ? "退出跟随" : "跟随视角" }}</n-button
      >
      <n-button size="small" quaternary @click="applyReset">重置</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="trajectory-split"
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
