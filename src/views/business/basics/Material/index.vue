<script setup lang="ts">
import * as Cesium from 'cesium';
import { ref } from 'vue';
import { useCesiumViewer } from '@/hooks/useCesiumViewer';
import { useCodeExplain } from '@/hooks/useCodeExplain';
import CodePanel from '@/components/base/CodePanel.vue';

const containerRef = ref<HTMLDivElement | null>(null);
const activeFeature = ref('color');
const statusText = ref('选择材质，观察同一几何体在不同材质下的表现。');

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: 'esri',
  camera: { position: [108.94, 34.34, 9000], pitch: -50 },
});

// 实体集合：不同几何体承载不同材质
const added = new Set<string>();
const entities: Record<string, Cesium.Entity | null> = {};

function toggle(feature: string, build: () => Cesium.Entity) {
  const v = viewer.value;
  if (!v) return;
  if (added.has(feature)) {
    if (entities[feature]) v.entities.remove(entities[feature]!);
    entities[feature] = null;
    added.delete(feature);
    statusText.value = `已移除：${feature}`;
  } else {
    const e = build();
    entities[feature] = e;
    v.entities.add(e);
    added.add(feature);
    statusText.value = `已添加：${feature}`;
  }
}

/** 用 Canvas 生成一张渐变色图片（DataURI），用于 Image 材质 */
function makeGradientImage(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 128, 128);
  g.addColorStop(0, '#ff6b6b');
  g.addColorStop(0.5, '#feca57');
  g.addColorStop(1, '#48dbfb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 128; i += 16) {
    ctx.fillRect(i, 0, 2, 128);
    ctx.fillRect(0, i, 128, 2);
  }
  return canvas.toDataURL();
}

/* ---------- 面/线几何体（静态位置） ---------- */

function polyPositions() {
  return Cesium.Cartesian3.fromDegreesArray([
    108.935, 34.338,
    108.945, 34.338,
    108.945, 34.345,
    108.935, 34.345,
  ]);
}

function applyColor() {
  activeFeature.value = 'color';
  toggle('color', () =>
    new Cesium.Entity({
      polygon: {
        hierarchy: polyPositions(),
        material: Cesium.Color.fromCssColorString('#ff6b6b').withAlpha(0.6), // 纯色
        outline: true,
        outlineColor: Cesium.Color.WHITE,
      },
    })
  );
}

function applyStripe() {
  activeFeature.value = 'stripe';
  toggle('stripe', () =>
    new Cesium.Entity({
      polygon: {
        hierarchy: polyPositions(),
        // 条纹材质：两条颜色交替
        material: new Cesium.StripeMaterialProperty({
          evenColor: Cesium.Color.fromCssColorString('#48dbfb').withAlpha(0.85),
          oddColor: Cesium.Color.fromCssColorString('#0984e3').withAlpha(0.85),
          repeat: 6, // 条纹重复次数
        }),
      },
    })
  );
}

function applyChecker() {
  activeFeature.value = 'checker';
  toggle('checker', () =>
    new Cesium.Entity({
      polygon: {
        hierarchy: polyPositions(),
        material: new Cesium.CheckerboardMaterialProperty({
          evenColor: Cesium.Color.WHITE.withAlpha(0.9),
          oddColor: Cesium.Color.fromCssColorString('#2d3436').withAlpha(0.9),
          repeat: new Cesium.Cartesian2(8, 8),
        }),
      },
    })
  );
}

function applyGrid() {
  activeFeature.value = 'grid';
  toggle('grid', () =>
    new Cesium.Entity({
      polygon: {
        hierarchy: polyPositions(),
        material: new Cesium.GridMaterialProperty({
          color: Cesium.Color.fromCssColorString('#fdcb6e'),
          cellAlpha: 0.25,
          lineCount: new Cesium.Cartesian2(10, 10),
        }),
      },
    })
  );
}

function applyImage() {
  activeFeature.value = 'image';
  toggle('image', () =>
    new Cesium.Entity({
      polygon: {
        hierarchy: polyPositions(),
        material: new Cesium.ImageMaterialProperty({
          image: makeGradientImage(), // DataURI 图片
          repeat: new Cesium.Cartesian2(2, 2),
        }),
      },
    })
  );
}

/* ---------- 线材质 ---------- */

function linePositions() {
  return Cesium.Cartesian3.fromDegreesArray([
    108.94, 34.33,
    108.95, 34.335,
    108.96, 34.33,
  ]);
}

function applyGlow() {
  activeFeature.value = 'glow';
  toggle('glow', () =>
    new Cesium.Entity({
      polyline: {
        positions: linePositions(),
        width: 8,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.45, // 发光强度
          taperPower: 0.6, // 末端衰减
          color: Cesium.Color.CYAN,
        }),
        clampToGround: true,
      },
    })
  );
}

function applyArrow() {
  activeFeature.value = 'arrow';
  toggle('arrow', () =>
    new Cesium.Entity({
      polyline: {
        positions: linePositions(),
        width: 10,
        // 1.145：PolylineArrowMaterialProperty 直接接收颜色
        material: new Cesium.PolylineArrowMaterialProperty(Cesium.Color.ORANGE),
        clampToGround: true,
      },
    })
  );
}

function applyDash() {
  activeFeature.value = 'dash';
  toggle('dash', () =>
    new Cesium.Entity({
      polyline: {
        positions: linePositions(),
        width: 4,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.YELLOW,
          gapColor: Cesium.Color.TRANSPARENT,
          dashLength: 24, // 虚线段长度(像素)
        }),
        clampToGround: true,
      },
    })
  );
}

function applyClear() {
  const v = viewer.value;
  if (!v) return;
  for (const key of Object.keys(entities)) {
    if (entities[key]) v.entities.remove(entities[key]!);
    entities[key] = null;
  }
  added.clear();
  statusText.value = '已清除全部材质实体';
}

const codeMap: Record<string, () => string> = {
  color: () => `// ① 纯色材质：直接给 Color
polygon: {
  material: Cesium.Color.fromCssColorString('#ff6b6b')
             .withAlpha(0.6),
  outline: true,
  outlineColor: Cesium.Color.WHITE,
}`,

  stripe: () => `// ② 条纹材质（面）
material: new Cesium.StripeMaterialProperty({
  evenColor: Cesium.Color.fromCssColorString('#48dbfb')
              .withAlpha(0.85),
  oddColor:  Cesium.Color.fromCssColorString('#0984e3')
              .withAlpha(0.85),
  repeat: 6,   // 条纹数量
})`,

  checker: () => `// ③ 棋盘格材质（面）
material: new Cesium.CheckerboardMaterialProperty({
  evenColor: Cesium.Color.WHITE.withAlpha(0.9),
  oddColor:  Cesium.Color.fromCssColorString('#2d3436')
              .withAlpha(0.9),
  repeat: new Cesium.Cartesian2(8, 8), // x/y 重复
})`,

  grid: () => `// ④ 网格材质（面）
material: new Cesium.GridMaterialProperty({
  color: Cesium.Color.fromCssColorString('#fdcb6e'),
  cellAlpha: 0.25,
  lineCount: new Cesium.Cartesian2(10, 10),
})`,

  image: () => `// ⑤ 图片贴图材质（面）
material: new Cesium.ImageMaterialProperty({
  image: 'https://.../texture.png', // URL/DataURI/Canvas
  repeat: new Cesium.Cartesian2(2, 2), // 平铺次数
})`,

  glow: () => `// ⑥ 发光材质（线）
material: new Cesium.PolylineGlowMaterialProperty({
  glowPower: 0.45,  // 发光强度 0~1
  taperPower: 0.6,  // 末端渐隐
  color: Cesium.Color.CYAN,
})`,

  arrow: () => `// ⑦ 箭头材质（线，表达流向）
material: new Cesium.PolylineArrowMaterialProperty(
  Cesium.Color.ORANGE,   // 直接传颜色
)`,

  dash: () => `// ⑧ 虚线材质（线）
material: new Cesium.PolylineDashMaterialProperty({
  color: Cesium.Color.YELLOW,
  gapColor: Cesium.Color.TRANSPARENT,
  dashLength: 24,  // 虚线单元长度(像素)
})`,
};

const explainMap: Record<string, () => string> = {
  color: () => `【原理】Entity 图形的 material 属性接收 MaterialProperty（随时间可变的材质）。
Color 可直接使用（内部包装为 ColorMaterialProperty）。

【材质体系】Cesium 材质分两类：
• Entity 层：MaterialProperty 族（本页展示）
• Primitive 层：Material 类（Geometry 绘制时使用，见“图元 Primitive”页）

【要点】颜色带 alpha 时，需配合场景的透明渲染（默认开启）。`,

  stripe: () => `【原理】StripeMaterialProperty 用两种颜色交替生成条纹，
repeat 控制条纹数量。常用于缓冲区、禁飞区等区域强调。`,

  checker: () => `【原理】棋盘格是调试材质（检查 UV/坐标是否正常）的经典选择，
also 常用于网格辅助面、测试纹理平铺。`,

  grid: () => `【原理】GridMaterialProperty 生成线网格面，cellAlpha 控制格线透明度，
lineCount 控制网格密度。适合平面统计图、棋盘格底图。`,

  image: () => `【原理】ImageMaterialProperty 将任意图片（URL/DataURI/Canvas）作为贴图，
repeat 控制平铺次数。本示例用 Canvas 动态生成渐变色图片（DataURI），
无需任何外部图片资源。

【要点】动态纹理可用 Canvas 每帧重绘并赋值 image，实现视频/动画纹理。`,

  glow: () => `【原理】PolylineGlowMaterialProperty 沿管线生成辉光：
• glowPower：光晕强度
• taperPower：线末端光晕渐隐（0=无渐隐）
常用于航线、辐射路径、动态扫描线。`,

  arrow: () => `【原理】箭头材质把线渲染为带流向箭头的管道，语义清晰：
管线、水流、交通流、飞行路径等方向性要素首选。`,

  dash: () => `【原理】虚线材质 dashLength 控制虚线段长度（像素），
gapColor 可设为透明或半透明色。用于规划路线、待建工程等。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" :type="activeFeature === 'color' ? 'primary' : 'default'" @click="applyColor">纯色 Color</n-button>
      <n-button size="small" :type="activeFeature === 'stripe' ? 'primary' : 'default'" @click="applyStripe">条纹 Stripe</n-button>
      <n-button size="small" :type="activeFeature === 'checker' ? 'primary' : 'default'" @click="applyChecker">棋盘格</n-button>
      <n-button size="small" :type="activeFeature === 'grid' ? 'primary' : 'default'" @click="applyGrid">网格 Grid</n-button>
      <n-button size="small" :type="activeFeature === 'image' ? 'primary' : 'default'" @click="applyImage">图片 Image</n-button>
      <n-button size="small" :type="activeFeature === 'glow' ? 'primary' : 'default'" @click="applyGlow">发光 Glow</n-button>
      <n-button size="small" :type="activeFeature === 'arrow' ? 'primary' : 'default'" @click="applyArrow">箭头 Arrow</n-button>
      <n-button size="small" :type="activeFeature === 'dash' ? 'primary' : 'default'" @click="applyDash">虚线 Dash</n-button>
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
