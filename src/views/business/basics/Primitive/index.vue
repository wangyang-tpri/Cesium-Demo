<script setup lang="ts">
import * as Cesium from 'cesium';
import { ref, provide } from 'vue';
import { useCesiumViewer } from '@/hooks/useCesiumViewer';
import { useCodeExplain } from '@/hooks/useCodeExplain';
import SplitViewer from '@/components/base/SplitViewer.vue';

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref('single');
const statusText = ref('Primitive：底层图元 API，一次渲染可绘制海量几何。');

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: 'esri',
  camera: { position: [108.94, 34.34, 25000], pitch: -60 },
});

// 分割条拖拽时通知 viewer 重新计算渲染尺寸
function onSplitChange() {
  viewer.value?.resize();
}

let primitives: Cesium.Primitive[] = [];
let compareEntities: Cesium.Entity[] = [];

function clearAll() {
  const v = viewer.value;
  if (!v) return;
  for (const p of primitives) v.scene.primitives.remove(p);
  primitives = [];
  for (const e of compareEntities) v.entities.remove(e);
  compareEntities = [];
}

/** 在经纬度网格上生成 n×n 个彩色实例 */
function buildInstances(count: number) {
  const instances: Cesium.GeometryInstance[] = [];
  const colors = [
    Cesium.Color.fromCssColorString('#ff6b6b'),
    Cesium.Color.fromCssColorString('#feca57'),
    Cesium.Color.fromCssColorString('#48dbfb'),
    Cesium.Color.fromCssColorString('#1dd1a1'),
    Cesium.Color.fromCssColorString('#a29bfe'),
  ];
  const side = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / side);
    const col = i % side;
    const lon = 108.9 + col * 0.006;
    const lat = 34.3 + row * 0.006;
    const pos = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
    instances.push(
      new Cesium.GeometryInstance({
        geometry: new Cesium.BoxGeometry({
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
          // 1.145：BoxGeometry 使用 minimum/maximum（角点），替代旧版 dimensions
          minimum: new Cesium.Cartesian3(-20, -20, -20),
          maximum: new Cesium.Cartesian3(20, 20, 20),
        }),
        modelMatrix: Cesium.Matrix4.fromTranslation(pos),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(colors[i % colors.length]!),
        },
      })
    );
  }
  return instances;
}

function applySingle() {
  activeFeature.value = 'single';
  clearAll();
  const v = viewer.value;
  if (!v) return;
  const primitive = new Cesium.Primitive({
    geometryInstances: buildInstances(1),
    appearance: new Cesium.PerInstanceColorAppearance({ translucent: true }),
  });
  v.scene.primitives.add(primitive);
  primitives = [primitive];
  statusText.value = '单个 GeometryInstance：1 个彩色立方体';
}

function applyBatch() {
  activeFeature.value = 'batch';
  clearAll();
  const v = viewer.value;
  if (!v) return;
  const count = 100;
  const primitive = new Cesium.Primitive({
    geometryInstances: buildInstances(count),
    appearance: new Cesium.PerInstanceColorAppearance({ translucent: true }),
  });
  v.scene.primitives.add(primitive);
  primitives = [primitive];
  statusText.value = `批量实例：${count} 个彩色立方体，合并为 1 次 draw call`;
}

function applyCompare() {
  activeFeature.value = 'compare';
  clearAll();
  const v = viewer.value;
  if (!v) return;
  // 左半区：Primitive 批量（一次 draw call）
  primitives = [
    new Cesium.Primitive({
      geometryInstances: buildInstances(50),
      appearance: new Cesium.PerInstanceColorAppearance({ translucent: true }),
    }),
  ];
  // 右半区：50 个独立 Entity（各占 draw call）
  const colors = [
    Cesium.Color.fromCssColorString('#ff6b6b'),
    Cesium.Color.fromCssColorString('#feca57'),
    Cesium.Color.fromCssColorString('#48dbfb'),
    Cesium.Color.fromCssColorString('#1dd1a1'),
  ];
  const side = Math.ceil(Math.sqrt(50));
  for (let i = 0; i < 50; i++) {
    const lon = 108.9 + 0.045 + (i % side) * 0.006;
    const lat = 34.3 + Math.floor(i / side) * 0.006;
    compareEntities.push(
      v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        box: {
          dimensions: new Cesium.Cartesian3(40, 40, 40),
          material: colors[i % colors.length]!.withAlpha(0.9),
        },
      })
    );
  }
  v.scene.primitives.add(primitives[0]!);
  statusText.value = '对比：左侧 50 个 Primitive 合并 1 次调用；右侧 50 个 Entity 各 1 次调用';
}

function applyEllipse() {
  activeFeature.value = 'ellipse';
  clearAll();
  const v = viewer.value;
  if (!v) return;
  const primitive = new Cesium.Primitive({
    geometryInstances: [
      new Cesium.GeometryInstance({
        geometry: new Cesium.EllipseGeometry({
          center: Cesium.Cartesian3.fromDegrees(108.94, 34.34, 0),
          semiMajorAxis: 1500,
          semiMinorAxis: 900,
          height: 0,
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString('#0984e3').withAlpha(0.55)),
        },
      }),
    ],
    appearance: new Cesium.PerInstanceColorAppearance({ translucent: true, closed: false }),
  });
  v.scene.primitives.add(primitive);
  primitives = [primitive];
  statusText.value = 'EllipseGeometry 图元：半透明椭圆面';
}

function applyClear() {
  activeFeature.value = 'single';
  clearAll();
  statusText.value = '已清除全部图元';
}

const codeMap: Record<string, () => string> = {
  single: () => `// ① 单个图元：Geometry + GeometryInstance + Appearance
const primitive = new Cesium.Primitive({
  geometryInstances: [
    new Cesium.GeometryInstance({
      geometry: new Cesium.BoxGeometry({
        vertexFormat:
          Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        minimum: new Cesium.Cartesian3(-20, -20, -20),
        maximum: new Cesium.Cartesian3(20, 20, 20),
      }),
      modelMatrix: Cesium.Matrix4.fromTranslation(position),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute
          .fromColor(Cesium.Color.RED),
      },
    }),
  ],
  appearance:
    new Cesium.PerInstanceColorAppearance({ translucent: true }),
})
viewer.scene.primitives.add(primitive)`,

  batch: () => `// ② 批量实例：同几何、不同位置/颜色 → 1 次 draw call
const instances = []
for (let i = 0; i < 100; i++) {
  instances.push(new Cesium.GeometryInstance({
    geometry: boxGeometry,        // ★ 共享同一个几何体
    modelMatrix: Matrix4.fromTranslation(pos[i]),
    attributes: {
      color: ColorGeometryInstanceAttribute.fromColor(color[i]),
    },
  }))
}
const primitive = new Cesium.Primitive({
  geometryInstances: instances,
  appearance: new Cesium.PerInstanceColorAppearance({
    translucent: true,
  }),
})
viewer.scene.primitives.add(primitive)`,

  compare: () => `// ③ Entity 与 Primitive 的本质区别
// Entity（声明式）：
viewer.entities.add({
  position, box: { dimensions, material }
})
// → 每个 Entity 单独生成 draw call（方便但开销大）

// Primitive（命令式）：
new Cesium.Primitive({ geometryInstances, appearance })
// → 同类实例合并渲染，GPU 调用次数锐减

// ★ 海量同构要素（万级）优先 Primitive；业务要素用 Entity`,

  ellipse: () => `// ④ 面图元：EllipseGeometry
new Cesium.Primitive({
  geometryInstances: [
    new Cesium.GeometryInstance({
      geometry: new Cesium.EllipseGeometry({
        center: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        semiMajorAxis: 1500,   // 长半轴(米)
        semiMinorAxis: 900,    // 短半轴(米)
        vertexFormat:
          Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: { color: ColorGeometryInstanceAttribute.fromColor(...) },
    }),
  ],
  appearance: new Cesium.PerInstanceColorAppearance({ translucent: true }),
})`,
};

const explainMap: Record<string, () => string> = {
  single: () => `【原理】Primitive 三层结构：
• Geometry：顶点/索引数据（BoxGeometry、EllipseGeometry…）
• GeometryInstance：几何 + 位置(modelMatrix) + 属性(color)
• Appearance：着色方式（PerInstanceColorAppearance 每实例取色）

【要点】Primitive 由开发者控制生命周期（scene.primitives.add/remove），
性能更高、控制更细，但代码量大。`,

  batch: () => `【原理】批量渲染的关键：所有实例共享同一份 Geometry，
仅通过 modelMatrix（位置/姿态）和 attributes.color 区分。
GPU 一次提交即可绘制全部实例 → 1 次 draw call。

【性能】1000+ 同构要素（树木、路灯、管线节点、粒子替代）应使用此方案，
Entity 方案同规模会明显卡顿。`,

  compare: () => `【原理】左侧 50 个 Primitive 实例 = 1 次 draw call；
右侧 50 个 Entity = 50 次 draw call（每个 Entity 独立创建几何）。

【选型建议】
• Entity：适合业务数据、交互拾取、动态属性（开发效率高）
• Primitive：适合海量静态/半静态同构要素（性能优先）
• 两者可混用：业务层 Entity + 海量层 Primitive`,

  ellipse: () => `【原理】EllipseGeometry 按中心点+长短半轴生成椭圆面，
是 Primitive 体系中的常用面图元（圆 = 长短轴相等）。

【要点】Cesium 提供约 30 种 Geometry：
Box/Cylinder/Sphere/Ellipse/Polygon/Polyline/Wall/Rectangle/
Corridor/Plane/Ellipsoid… 都可配合 GeometryInstance 批量使用。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" :type="activeFeature === 'single' ? 'primary' : 'default'" @click="applySingle">单个实例</n-button>
      <n-button size="small" :type="activeFeature === 'batch' ? 'primary' : 'default'" @click="applyBatch">批量 100 实例</n-button>
      <n-button size="small" :type="activeFeature === 'compare' ? 'primary' : 'default'" @click="applyCompare">Entity vs Primitive</n-button>
      <n-button size="small" :type="activeFeature === 'ellipse' ? 'primary' : 'default'" @click="applyEllipse">椭圆面图元</n-button>
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="primitive-split"
      @split-change="onSplitChange"
    >
      <template #scene-overlay>
        <div class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white">{{ statusText }}</div>
      </template>
    </SplitViewer>
  </div>
</template>
