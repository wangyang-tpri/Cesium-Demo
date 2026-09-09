<script setup lang="ts">
import * as Cesium from 'cesium';
import { onMounted, ref, provide } from 'vue';
import { useCesiumViewer } from '@/hooks/useCesiumViewer';
import { useCodeExplain } from '@/hooks/useCodeExplain';
import SplitViewer from '@/components/base/SplitViewer.vue';

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref('load');
const statusText = ref('轨迹模拟：SampledPositionProperty 采样 + 速度朝向 + 时间轴联动。');

const TRAJ_START = Cesium.JulianDate.fromIso8601('2026-01-01T00:00:00Z');
const TRAJ_STOP = Cesium.JulianDate.fromIso8601('2026-01-01T00:10:00Z');

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: 'esri',
  camera: { position: [108.94, 34.34, 90000], pitch: -60 },
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
      v.camera.lookAt(pos, new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(180), // 从运动反方向看（正后方）
        Cesium.Math.toRadians(-25),
        3000
      ));
    }
  },
});

const following = ref(false);
const speedIndex = ref(2);

let craft: Cesium.Entity | null = null;
let pathEntity: Cesium.Entity | null = null;
let built = false;

/** 生成 10 分钟绕行轨迹（程序化采样），并返回采样点数组供轨迹线使用 */
function buildTrajectory(): { position: Cesium.SampledPositionProperty; samples: Cesium.Cartesian3[] } {
  const position = new Cesium.SampledPositionProperty();
  const samples: Cesium.Cartesian3[] = [];
  const steps = 50;
  for (let i = 0; i <= steps; i++) {
    const t = Cesium.JulianDate.addSeconds(TRAJ_START, (i / steps) * 600, new Cesium.JulianDate());
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

  // 轨迹线（全路径可视化）
  if (samples.length) {
    pathEntity = v.entities.add({
      polyline: {
        positions: samples,
        width: 3,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.35,
          color: Cesium.Color.fromCssColorString('#00d2ff'),
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
      material: Cesium.Color.fromCssColorString('#ff9f43'),
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
      resolution: 60,
      leadTime: 120, // 显示未来 2 分钟
      trailTime: 300, // 显示过去 5 分钟
      width: 4,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.3,
        color: Cesium.Color.fromCssColorString('#ff6b6b'),
      }),
    },
    label: {
      text: '飞行器',
      font: '14px Microsoft YaHei, sans-serif',
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
  activeFeature.value = 'load';
  buildCraft();
  const v = viewer.value;
  if (!v) return;
  v.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(108.94, 34.34, 90000),
    duration: 1.5,
  });
  statusText.value = '轨迹已生成：50 个采样点 + 拉格朗日插值；点击 ▶ 开始运动';
}

function applyPlay() {
  activeFeature.value = 'play';
  buildCraft();
  const v = viewer.value;
  if (!v) return;
  v.clock.shouldAnimate = !v.clock.shouldAnimate;
  statusText.value = v.clock.shouldAnimate ? '▶ 运动播放中（红色为实时轨迹，蓝色为全路径）' : '⏸ 已暂停';
}

function applySpeed() {
  activeFeature.value = 'play';
  const v = viewer.value;
  if (!v) return;
  speedIndex.value = (speedIndex.value % 4) + 1;
  v.clock.multiplier = [10, 60, 300, 600][speedIndex.value - 1]!;
  statusText.value = `速度：1 真实秒 = ${v.clock.multiplier} 模拟秒`;
}

function applyFollow() {
  activeFeature.value = 'look';
  buildCraft();
  const v = viewer.value;
  if (!v) return;
  following.value = !following.value;
  if (following.value && !v.clock.shouldAnimate) {
    v.clock.shouldAnimate = true;
  }
  statusText.value = following.value ? '跟随视角：相机锁定飞行器（lookAt 相对偏移）' : '已退出跟随视角';
}

function applyReset() {
  activeFeature.value = 'load';
  following.value = false;
  const v = viewer.value;
  if (!v) return;
  v.clock.shouldAnimate = false;
  v.clock.currentTime = TRAJ_START;
  v.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(108.94, 34.34, 90000),
    duration: 1,
  });
  statusText.value = '已重置到起点';
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
    resolution: 60,
    leadTime: 120,   // 显示未来轨迹
    trailTime: 300,  // 显示过去轨迹
    width: 4,
    material: ...,
  },
})`,
};

const explainMap: Record<string, () => string> = {
  load: () => `【原理】轨迹模拟三步走：
1. 采样：SampledPositionProperty 存 (时间, 位置) 关键帧
2. 插值：默认拉格朗日插值（可换样条/线性），任意时刻有位置
3. 联动：Entity.position 用该属性 + clock 驱动 → 自动运动

【配套】
• VelocityOrientationProperty：由位置自动推导速度方向（飞行器朝向）
• path：按时间渲染“过去/未来”轨迹（leadTime/trailTime 控制）
• path.resolution：轨迹采样分辨率（秒）

【要点】与“时钟”页的 CallbackProperty 方案相比，
采样方案数据可回放、可预测，是工程轨迹的标准做法。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" :type="activeFeature === 'load' ? 'primary' : 'default'" @click="applyLoad">生成轨迹</n-button>
      <n-button size="small" :type="activeFeature === 'play' ? 'primary' : 'default'" @click="applyPlay">播放 / 暂停</n-button>
      <n-button size="small" :type="activeFeature === 'play' ? 'primary' : 'default'" @click="applySpeed">速度 {{ speedIndex }}/4</n-button>
      <n-button size="small" :type="activeFeature === 'look' ? 'primary' : 'default'" @click="applyFollow">{{ following ? '退出跟随' : '跟随视角' }}</n-button>
      <n-button size="small" quaternary @click="applyReset">重置</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="trajectory-split"
      @split-change="onSplitChange"
    >
      <template #scene-overlay>
        <div class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white">{{ statusText }}</div>
      </template>
    </SplitViewer>
  </div>
</template>
