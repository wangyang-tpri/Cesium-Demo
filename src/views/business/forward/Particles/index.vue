<script setup lang="ts">
import * as Cesium from 'cesium';
import { ref } from 'vue';
import { useCesiumViewer } from '@/hooks/useCesiumViewer';
import { useCodeExplain } from '@/hooks/useCodeExplain';
import CodePanel from '@/components/base/CodePanel.vue';

const containerRef = ref<HTMLDivElement | null>(null);
const activeFeature = ref('fire');
const statusText = ref('粒子系统：火焰 / 喷泉 / 降雨 / 降雪。');

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: 'esri',
  camera: { position: [108.94, 34.34, 6000], pitch: -50 },
  // 粒子系统依赖时钟推进（frameState.time 变化 → dt > 0 → 发射粒子），必须启用动画
  clock: { shouldAnimate: true },
});

const systems: Cesium.ParticleSystem[] = [];

function removeAll() {
  const v = viewer.value;
  if (!v) return;
  for (const s of systems) v.scene.primitives.remove(s);
  systems.length = 0;
}

/** 生成圆形渐变粒子纹理（DataURI） */
function makeParticleImage(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return canvas.toDataURL();
}

const particleImage = makeParticleImage();

/** 1.145：gravity 选项已移除，用 updateCallback 施加恒定重力（ENU 下 +Z 向上，g<0 向下） */
function makeGravity(g: number): (p: Cesium.Particle, dt: number) => void {
  const dv = new Cesium.Cartesian3();
  return (p, dt) => {
    Cesium.Cartesian3.multiplyByScalar(
      new Cesium.Cartesian3(0, 0, g),
      dt,
      dv
    );
    p.velocity = Cesium.Cartesian3.add(p.velocity, dv, p.velocity);
  };
}

function flyTo(pos: Cesium.Cartesian3, height = 2500) {
  viewer.value?.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      Cesium.Math.toDegrees(Cesium.Cartographic.fromCartesian(pos).longitude),
      Cesium.Math.toDegrees(Cesium.Cartographic.fromCartesian(pos).latitude),
      height
    ),
    duration: 1.5,
  });
}

function applyFire() {
  activeFeature.value = 'fire';
  removeAll();
  const v = viewer.value;
  if (!v) return;
  const pos = Cesium.Cartesian3.fromDegrees(108.94, 34.34, 0);
  const system = new Cesium.ParticleSystem({
    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(pos),
    emitter: new Cesium.ConeEmitter(Cesium.Math.toRadians(20)), // 锥形向上喷射
    startColor: Cesium.Color.fromCssColorString('#ff9f43').withAlpha(0.9),
    endColor: Cesium.Color.fromCssColorString('#e74c3c').withAlpha(0.1),
    startScale: 1.2,
    endScale: 0.1,
    imageSize: new Cesium.Cartesian2(14, 14),
    speed: 8,
    emissionRate: 60,
    lifetime: 16,
    updateCallback: makeGravity(0),
    image: particleImage,
  });
  v.scene.primitives.add(system);
  systems.push(system);
  flyTo(pos);
  statusText.value = '火焰：ConeEmitter 锥形发射 + 颜色渐变 + 缩小消失';
}

function applyFountain() {
  activeFeature.value = 'fountain';
  removeAll();
  const v = viewer.value;
  if (!v) return;
  const pos = Cesium.Cartesian3.fromDegrees(108.94, 34.34, 0);
  const system = new Cesium.ParticleSystem({
    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(pos),
    emitter: new Cesium.SphereEmitter(2), // 球面均匀喷射
    startColor: Cesium.Color.fromCssColorString('#a29bfe').withAlpha(0.95),
    endColor: Cesium.Color.fromCssColorString('#dfe6e9').withAlpha(0),
    startScale: 0.6,
    endScale: 0.05,
    imageSize: new Cesium.Cartesian2(12, 12),
    speed: 15,
    updateCallback: makeGravity(-9.8), // 重力（ENU 下 +Z 向上，负值向下拉）
    emissionRate: 40,
    lifetime: 20,
    image: particleImage,
  });
  v.scene.primitives.add(system);
  systems.push(system);
  flyTo(pos, 1800);
  statusText.value = '喷泉：SphereEmitter 球面喷射 + 重力回落地表';
}

function applyRain() {
  activeFeature.value = 'rain';
  removeAll();
  const v = viewer.value;
  if (!v) return;
  const pos = Cesium.Cartesian3.fromDegrees(108.94, 34.34, 0);
  const system = new Cesium.ParticleSystem({
    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(pos),
    emitter: new Cesium.BoxEmitter(new Cesium.Cartesian3(600, 600, 100)), // 大片区域
    startColor: Cesium.Color.fromCssColorString('#74b9ff').withAlpha(0.5),
    endColor: Cesium.Color.fromCssColorString('#0984e3').withAlpha(0),
    imageSize: new Cesium.Cartesian2(4, 4),
    startScale: 0.6,
    endScale: 1,
    speed: 120,       // 高速下落
    updateCallback: makeGravity(-60),
    emissionRate: 400,
    lifetime: 30,
    image: particleImage,
  });
  v.scene.primitives.add(system);
  systems.push(system);
  flyTo(pos, 2500);
  statusText.value = '降雨：BoxEmitter 大面积区域 + 高速下落粒子';
}

function applySnow() {
  activeFeature.value = 'snow';
  removeAll();
  const v = viewer.value;
  if (!v) return;
  const pos = Cesium.Cartesian3.fromDegrees(108.94, 34.34, 0);
  const system = new Cesium.ParticleSystem({
    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(pos),
    emitter: new Cesium.BoxEmitter(new Cesium.Cartesian3(800, 800, 200)),
    startColor: Cesium.Color.WHITE.withAlpha(0.8),
    endColor: Cesium.Color.WHITE.withAlpha(0.2),
    imageSize: new Cesium.Cartesian2(6, 6),
    startScale: 1,
    endScale: 0.4,
    speed: 8,        // 缓慢飘落
    updateCallback: makeGravity(-2),
    emissionRate: 150,
    lifetime: 40,
    image: particleImage,
  });
  v.scene.primitives.add(system);
  systems.push(system);
  flyTo(pos, 2500);
  statusText.value = '降雪：低速飘落 + 大面积 + 柔白粒子';
}

function applyClear() {
  activeFeature.value = 'fire';
  removeAll();
  statusText.value = '已清除粒子系统';
}

const codeMap: Record<string, () => string> = {
  fire: () => `// ① 火焰：锥形发射器 + 颜色渐变
const system = new Cesium.ParticleSystem({
  modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(
    Cesium.Cartesian3.fromDegrees(lon, lat, 0)),
  emitter: new Cesium.ConeEmitter(
    Cesium.Math.toRadians(20)),   // 喷射锥角
  startColor: Cesium.Color.fromCssColorString('#ff9f43')
                .withAlpha(0.9),
  endColor:   Cesium.Color.fromCssColorString('#e74c3c')
                .withAlpha(0.1),
  startScale: 1.2,  // 出生大小
  endScale:   0.1,  // 消亡大小（火焰升腾变小）
  imageSize: new Cesium.Cartesian2(14, 14), // 粒子像素尺寸
  speed: 8,
  emissionRate: 60, // 每秒发射数
  lifetime: 16,     // 粒子存活秒数
  image: particleImage, // 圆形渐变贴图
})
viewer.scene.primitives.add(system)`,

  fountain: () => `// ② 喷泉：球面发射 + 重力
emitter: new Cesium.SphereEmitter(2), // 半径2m球面
startColor: ...,
endColor: Cesium.Color.fromCssColorString('#dfe6e9')
            .withAlpha(0),
imageSize: new Cesium.Cartesian2(12, 12),
speed: 15,
// 1.145：gravity 选项移除，改 updateCallback 施加
updateCallback: (p, dt) => {
  p.velocity = Cesium.Cartesian3.add(
    p.velocity,
    Cesium.Cartesian3.multiplyByScalar(
      new Cesium.Cartesian3(0, 0, -9.8), dt,
      new Cesium.Cartesian3()),
    p.velocity)
},
emissionRate: 40,
lifetime: 20`,

  rain: () => `// ③ 降雨：大盒状区域 + 高速下落
emitter: new Cesium.BoxEmitter(
  new Cesium.Cartesian3(600, 600, 100)), // 长宽高(米)
imageSize: new Cesium.Cartesian2(4, 4),
speed: 120,
updateCallback: gravity(-60),
emissionRate: 400,
lifetime: 30`,

  snow: () => `// ④ 降雪：低速飘落 + 大范围
emitter: new Cesium.BoxEmitter(
  new Cesium.Cartesian3(800, 800, 200)),
imageSize: new Cesium.Cartesian2(6, 6),
speed: 8,
updateCallback: gravity(-2),
emissionRate: 150,
lifetime: 40`,

  clear: () => `// 清除
viewer.scene.primitives.remove(system)
// system 无需手动销毁（Primitive 生命周期由 scene 管理）`,
};

const explainMap: Record<string, () => string> = {
  fire: () => `【原理】ParticleSystem 每帧按 emissionRate 生成粒子：
• emitter 决定初始位置/方向（Cone/Sphere/Box/Circle…）
• startColor→endColor 渐变，startScale→endScale 缩放
• speed 与 updateCallback 合力决定运动轨迹
• 粒子纹理常为圆形渐变（Canvas 生成，无需外部图片）

【要点】粒子是“广告牌四边形”，成本低，可大规模使用。`,

  fountain: () => `【原理】updateCallback 是粒子系统的物理引擎入口
（1.145 起替代旧的 gravity 选项，ENU 下 +Z 为正）：
• 每帧回调 (particle, dt)，可在内部改 velocity/position
• 叠加 (0, 0, g*dt) 即等效重力：g=-9.8 模拟地心引力
• 不传回调则粒子保持初始速度（火焰/烟雾升腾用正 speed）

【要点】SphereEmitter(radius) 从球面任意方向射出，
配合重力形成“喷泉/爆炸”效果。`,

  rain: () => `【原理】雨滴的视觉效果主要靠“高速 + 细长比例”：
speed 120 + 重力 -60 使雨滴快速下落，imageSize(4,4) 保持细密。
BoxEmitter 用大范围（600×600m）覆盖视野，形成“下雨”氛围。

【要点】emissionRate 400 时粒子密度高，注意与 lifetime 配合控制总量。`,

  snow: () => `【原理】降雪与降雨相反：低 speed（8）+ 低重力（-2）+ 大尺寸，
粒子缓慢飘落，配合白色渐变模拟雪花质感。

【要点】调整 speed/gravity/emissionRate 三参数即可在
雨/雪/沙尘等天气效果间切换。`,

  clear: () => `【原理】粒子系统是 Primitive 子类，scene.primitives.remove() 即可回收。
注意：反复创建/销毁大量粒子系统会造成 GPU 内存抖动，应复用实例。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" :type="activeFeature === 'fire' ? 'primary' : 'default'" @click="applyFire">火焰</n-button>
      <n-button size="small" :type="activeFeature === 'fountain' ? 'primary' : 'default'" @click="applyFountain">喷泉</n-button>
      <n-button size="small" :type="activeFeature === 'rain' ? 'primary' : 'default'" @click="applyRain">降雨</n-button>
      <n-button size="small" :type="activeFeature === 'snow' ? 'primary' : 'default'" @click="applySnow">降雪</n-button>
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <div class="flex min-h-0 flex-1 gap-3">
      <div class="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-gray-200 shadow-sm">
        <div ref="containerRef" class="h-full w-full"></div>
        <div class="absolute left-3 top-3 z-10 rounded bg-black/60 px-3 py-1.5 text-xs text-white">{{ statusText }}</div>
      </div>
      <CodePanel :title="activeFeature" :code="code" :explanation="explanation" />
    </div>
  </div>
</template>
