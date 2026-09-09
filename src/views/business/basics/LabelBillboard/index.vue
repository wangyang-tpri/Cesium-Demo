<script setup lang="ts">
import * as Cesium from 'cesium';
import { ref, provide } from 'vue';
import { useCesiumViewer } from '@/hooks/useCesiumViewer';
import { useCodeExplain } from '@/hooks/useCodeExplain';
import SplitViewer from '@/components/base/SplitViewer.vue';

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref('label');
const statusText = ref('Label 标注 / Billboard 广告牌 / 图钉 / 集合批量。');

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: 'esri',
  camera: { position: [108.9, 34.2, 2600000], pitch: -55 },
});

// 分割条拖拽时通知 viewer 重新计算渲染尺寸
function onSplitChange() {
  viewer.value?.resize();
}

const CITY_LABELS = [
  { name: '北京', lon: 116.397, lat: 39.909 },
  { name: '上海', lon: 121.474, lat: 31.23 },
  { name: '广州', lon: 113.264, lat: 23.129 },
  { name: '成都', lon: 104.066, lat: 30.573 },
  { name: '西安', lon: 108.94, lat: 34.341 },
  { name: '拉萨', lon: 91.117, lat: 29.645 },
  { name: '乌鲁木齐', lon: 87.617, lat: 43.793 },
  { name: '哈尔滨', lon: 126.642, lat: 45.757 },
];

let built: Cesium.Entity[] = [];

function clearBuilt() {
  const v = viewer.value;
  if (!v) return;
  for (const e of built) v.entities.remove(e);
  built = [];
  v.entities.removeAll(); // 清掉其他演示留下的
}

function applyLabels() {
  activeFeature.value = 'label';
  clearBuilt();
  const v = viewer.value;
  if (!v) return;
  for (const c of CITY_LABELS) {
    built.push(
      v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, 0),
        label: {
          text: c.name,
          font: 'bold 16px Microsoft YaHei, sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.fromCssColorString('#2c3e50'),
          outlineWidth: 4,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -22),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        },
      })
    );
  }
  statusText.value = `基础标注：${CITY_LABELS.length} 个城市名`;
}

function applyLabelStyle() {
  activeFeature.value = 'label-style';
  clearBuilt();
  const v = viewer.value;
  if (!v) return;
  built.push(
    v.entities.add({
      position: Cesium.Cartesian3.fromDegrees(108.94, 34.341, 0),
      label: {
        text: '西安·钟楼商圈',
        font: 'bold 18px Microsoft YaHei, sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#f1c40f'),
        // 背景 + 边框
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#2c3e50').withAlpha(0.85),
        backgroundPadding: new Cesium.Cartesian2(12, 8),
        pixelOffset: new Cesium.Cartesian2(0, -40),
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineColor: Cesium.Color.fromCssColorString('#7f8c8d'),
        outlineWidth: 2,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      },
    })
  );
  statusText.value = '样式标注：背景框 + 边框 + 偏移 + 大字号';
}

function applyBillboards() {
  activeFeature.value = 'billboard';
  clearBuilt();
  const v = viewer.value;
  if (!v) return;
  const icons = ['airport.png', 'star.png', 'hospital.png', 'park.png', 'school.png', 'bank.png', 'town.png', 'harbor.png'];
  CITY_LABELS.forEach((c, i) => {
    built.push(
      v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, 0),
        billboard: {
          image: Cesium.buildModuleUrl(`Assets/Textures/maki/${icons[i % icons.length]!}`),
          scale: 1.6,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        },
        label: {
          text: c.name,
          font: '13px Microsoft YaHei, sans-serif',
          pixelOffset: new Cesium.Cartesian2(0, -22),
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        },
      })
    );
  });
  statusText.value = 'Billboard：maki 图标 + 名称标注';
}

function applyPin() {
  activeFeature.value = 'pin';
  clearBuilt();
  const v = viewer.value;
  if (!v) return;
  // PinBuilder 生成彩色图钉（Canvas DataURI，无需图片资源）
  const pinBuilder = new Cesium.PinBuilder();
  const colors = [
    Cesium.Color.RED,
    Cesium.Color.ORANGE,
    Cesium.Color.YELLOW,
    Cesium.Color.GREEN,
    Cesium.Color.BLUE,
    Cesium.Color.PURPLE,
  ];
  CITY_LABELS.forEach((c, i) => {
    built.push(
      v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, 0),
        billboard: {
          image: pinBuilder.fromColor(colors[i % colors.length]!, 64).toDataURL(),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          scale: 0.8,
        },
        label: {
          text: c.name,
          font: '12px Microsoft YaHei, sans-serif',
          pixelOffset: new Cesium.Cartesian2(0, -20),
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        },
      })
    );
  });
  statusText.value = 'PinBuilder 图钉：按颜色区分城市';
}

function applyCollection() {
  activeFeature.value = 'collection';
  clearBuilt();
  const v = viewer.value;
  if (!v) return;
  // LabelCollection：批量标注（远优于逐个 Entity）
  const collection = new Cesium.LabelCollection();
  const cols = 20;
  const rows = 10;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      collection.add({
        position: Cesium.Cartesian3.fromDegrees(103 + c * 0.12, 30 + r * 0.12, 0),
        text: `${r}-${c}`,
        font: '12px monospace',
        fillColor: Cesium.Color.WHITE.withAlpha(0.9),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -8),
      });
    }
  }
  v.scene.primitives.add(collection);
  built.push(collection as unknown as Cesium.Entity);
  v.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(104.2, 30.6, 600000),
    duration: 1.5,
  });
  statusText.value = `LabelCollection：${cols * rows} 个标注 = 1 个图元`;
}

function applyClear() {
  activeFeature.value = 'label';
  clearBuilt();
  statusText.value = '已清除';
}

const codeMap: Record<string, () => string> = {
  label: () => `// ① 基础标注
viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
  label: {
    text: '北京',
    font: 'bold 16px Microsoft YaHei, sans-serif',
    fillColor: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.fromCssColorString('#2c3e50'),
    outlineWidth: 4,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new Cesium.Cartesian2(0, -22),
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
  },
})`,

  'label-style': () => `// ② 丰富样式：背景框/内边距/偏移
label: {
  text: '西安·钟楼商圈',
  font: 'bold 18px Microsoft YaHei, sans-serif',
  showBackground: true,
  backgroundColor:
    Cesium.Color.fromCssColorString('#2c3e50').withAlpha(0.85),
  backgroundPadding: new Cesium.Cartesian2(12, 8),
  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
  outlineColor: Cesium.Color.fromCssColorString('#7f8c8d'),
  outlineWidth: 2,
  pixelOffset: new Cesium.Cartesian2(0, -40),
  verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
}`,

  billboard: () => `// ③ 广告牌图标
billboard: {
  image: Cesium.buildModuleUrl(
    'Assets/Textures/maki/airport.png'),
  scale: 1.6,
  verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
}
// ★ Billboard 始终面向相机；可与 label 同时使用`,

  pin: () => `// ④ 程序化图钉（无需图片资源）
const pinBuilder = new Cesium.PinBuilder()
billboard: {
  image: pinBuilder.fromColor(Cesium.Color.RED, 64)
    .toDataURL(),   // Canvas → DataURI
  verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
}`,

  collection: () => `// ⑤ 集合批量（性能关键）
const collection = new Cesium.LabelCollection()
collection.add({
  position: ...,
  text: '01',
  font: '12px monospace',
  ...
})
viewer.scene.primitives.add(collection)
// ★ 一个集合 = 一个图元；成千上万标注用它而非 Entity`,
};

const explainMap: Record<string, () => string> = {
  label: () => `【原理】Label 渲染为 Canvas 纹理，始终面向相机。
锚点由 horizontalOrigin/verticalOrigin 决定（LEFT/CENTER/RIGHT × TOP/CENTER/BOTTOM），
pixelOffset 做像素级微调。

【要点】outline 描边能显著提升文字在地图上的可读性；
中文指定字体（微软雅黑等）保证清晰。`,

  'label-style': () => `【原理】showBackground 给文字加圆角背景板，
backgroundColor + backgroundPadding 控制样式与间距。
组合：大字号 + 描边 + 背景板 = 高可读性的主标注。

【要点】背景板是 Canvas 绘制，不影响拾取性能。`,

  billboard: () => `【原理】Billboard 把图片绘制为面向相机的四边形，
是 POI 图标标准方案。image 支持：
• URL（网络/本地/DataURI）
• Canvas 元素（动态绘制）
• 内置 maki 图标（Build/Cesium/Assets/Textures）

【要点】color 可整体着色；scale 控制大小；
width/height 可直接指定像素尺寸。`,

  pin: () => `【原理】PinBuilder 用 Canvas 程序化生成“图钉”图标，
fromColor(color, size) 生成指定颜色的图钉，适合：
• 分类点（红色=事故、绿色=正常）
• 动态数据无图片资源时

【要点】生成的 image 是 DataURI 字符串，可直接用于 billboard.image。`,

  collection: () => `【原理】LabelCollection/BillboardCollection/PointPrimitiveCollection
把海量同类要素合并为一个 Primitive 渲染：
• 50 个 Entity Label ≈ 50 次 draw call
• 1 个含 50 个成员的 LabelCollection ≈ 1 次 draw call

【要点】万级标注场景必须使用集合；集合成员支持动态增删。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" :type="activeFeature === 'label' ? 'primary' : 'default'" @click="applyLabels">基础标注</n-button>
      <n-button size="small" :type="activeFeature === 'label-style' ? 'primary' : 'default'" @click="applyLabelStyle">样式标注</n-button>
      <n-button size="small" :type="activeFeature === 'billboard' ? 'primary' : 'default'" @click="applyBillboards">图标广告牌</n-button>
      <n-button size="small" :type="activeFeature === 'pin' ? 'primary' : 'default'" @click="applyPin">图钉 Pin</n-button>
      <n-button size="small" :type="activeFeature === 'collection' ? 'primary' : 'default'" @click="applyCollection">集合批量 200</n-button>
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="labelbillboard-split"
      @split-change="onSplitChange"
    >
      <template #scene-overlay>
        <div class="absolute left-3 top-3 z-10 rounded bg-black/60 px-3 py-1.5 text-xs text-white">{{ statusText }}</div>
      </template>
    </SplitViewer>
  </div>
</template>
