<script setup lang="ts">
import * as Cesium from 'cesium';
import { onMounted, ref, provide } from 'vue';
import { useCesiumViewer } from '@/hooks/useCesiumViewer';
import { useCodeExplain } from '@/hooks/useCodeExplain';
import SplitViewer from '@/components/base/SplitViewer.vue';

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref('pick-entity');
const statusText = ref('选择拾取模式后点击场景观察结果。');

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: 'esri',
  camera: { position: [108.94, 34.34, 2000], pitch: -40 },
});

// 分割条拖拽时通知 viewer 重新计算渲染尺寸
function onSplitChange() {
  viewer.value?.resize();
}

let handler: Cesium.ScreenSpaceEventHandler | null = null;
let marker: Cesium.Entity | null = null;
let mode = 'pick-entity';

onMounted(() => {
  const v = viewer.value;
  if (!v) return;

  // 场景要素：三个不同高度的盒子 + 一个椭球
  const items = [
    { lon: 108.935, lat: 34.34, h: 60, color: '#e74c3c' },
    { lon: 108.945, lat: 34.34, h: 100, color: '#f39c12' },
    { lon: 108.955, lat: 34.34, h: 40, color: '#27ae60' },
  ];
  for (const it of items) {
    v.entities.add({
      position: Cesium.Cartesian3.fromDegrees(it.lon, it.lat, it.h / 2),
      box: {
        dimensions: new Cesium.Cartesian3(50, 50, it.h),
        material: Cesium.Color.fromCssColorString(it.color).withAlpha(0.9),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
      },
      label: {
        text: `高度 ${it.h}m`,
        font: '13px Microsoft YaHei, sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -30),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      },
    });
  }

  handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
  handler.setInputAction((e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const scene = v.scene;
    const pos = e.position;
    if (marker) {
      v.entities.remove(marker);
      marker = null;
    }

    if (mode === 'pick-entity') {
      const picked = scene.pick(pos);
      if (Cesium.defined(picked) && picked.id instanceof Cesium.Entity) {
        // 1.145：LabelGraphics 无 getValue()，直接读 text 属性
        const text = (picked.id as Cesium.Entity).label?.text;
        const labelText = text instanceof Cesium.ConstantProperty ? String(text.getValue(Cesium.JulianDate.now())) : text;
        statusText.value = `scene.pick → 命中实体【${String(picked.id.id)}】${labelText ? `（${labelText}）` : ''}`;
      } else {
        statusText.value = 'scene.pick → 未命中实体';
      }
    } else if (mode === 'pick-position') {
      // 深度拾取：读深度缓冲 → 表面真实世界坐标
      const cartesian = scene.pickPosition(pos);
      if (Cesium.defined(cartesian)) {
        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        statusText.value =
          `scene.pickPosition → 表面坐标：经度 ${Cesium.Math.toDegrees(carto.longitude).toFixed(5)}°，` +
          `纬度 ${Cesium.Math.toDegrees(carto.latitude).toFixed(5)}°，` +
          `高度 ${carto.height.toFixed(1)} m`;
        marker = v.entities.add({
          position: cartesian,
          point: { pixelSize: 10, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
        });
      } else {
        statusText.value = 'scene.pickPosition → 未命中（天空/深度纹理不可用）';
      }
    } else if (mode === 'pick-ellipsoid') {
      const cartesian = v.camera.pickEllipsoid(pos, v.scene.globe.ellipsoid);
      if (cartesian) {
        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        statusText.value =
          `camera.pickEllipsoid → 椭球面坐标：` +
          `经度 ${Cesium.Math.toDegrees(carto.longitude).toFixed(5)}°，` +
          `纬度 ${Cesium.Math.toDegrees(carto.latitude).toFixed(5)}°（无视模型高度）`;
      }
    } else if (mode === 'drill-pick') {
      const hits = scene.drillPick(pos, 10);
      if (hits.length) {
        const names = hits
          .map((h, i) => `${i + 1}.${h.id && h.id.id !== undefined ? String(h.id.id) : h.primitive?.constructor.name ?? '?'}`)
          .join('  ');
        statusText.value = `scene.drillPick → 命中 ${hits.length} 层：${names}`;
      } else {
        statusText.value = 'scene.drillPick → 无命中';
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
});

function setMode(m: string) {
  mode = m;
  activeFeature.value = m;
  const labels: Record<string, string> = {
    'pick-entity': '点击场景：拾取实体并显示名称',
    'pick-position': '点击场景：读取表面真实坐标（深度拾取）',
    'pick-ellipsoid': '点击场景：读取椭球面坐标（忽略模型高度）',
    'drill-pick': '点击场景：穿透式拾取多层对象',
  };
  statusText.value = labels[m] ?? '';
}

const codeMap: Record<string, () => string> = {
  'pick-entity': () => `// ① scene.pick：拾取像素处最上层对象
const picked = viewer.scene.pick(position)
if (Cesium.defined(picked)) {
  picked.id          // Entity（或其 id）
  picked.primitive   // Primitive / Cesium3DTileFeature
  picked.node        // glTF 节点
}`,

  'pick-position': () => `// ② scene.pickPosition：深度拾取
// 读深度缓冲区 → 像素对应表面点的真实世界坐标
const cartesian = viewer.scene.pickPosition(position)
if (Cesium.defined(cartesian)) {
  const carto =
    Cesium.Cartographic.fromCartesian(cartesian)
  // 得到含高程的表面坐标
}
// ★ 依赖 WebGL 深度纹理；对天空/无效深度返回 undefined`,

  'pick-ellipsoid': () => `// ③ camera.pickEllipsoid：射线与椭球求交
const cartesian = viewer.camera.pickEllipsoid(
  position,
  viewer.scene.globe.ellipsoid)
// 特点：只算椭球面（忽略模型/地形高度）
// 常用于“落到地球表面”的交互`,

  'drill-pick': () => `// ④ scene.drillPick：穿透式拾取（多层）
const hits = viewer.scene.drillPick(position, 10)
// 返回从近到远的命中列表（最多10个）
hits.forEach(h => console.log(h.id, h.primitive))
// 用于：点选遮挡物后的对象、批量选取`,
};

const explainMap: Record<string, () => string> = {
  'pick-entity': () => `【原理】scene.pick 是“像素反查询”：渲染完成后
从命中像素读出该处对象。开销极小，是点选交互的默认方案。

【返回】picked 结构随对象类型不同：
• Entity → picked.id 是 Entity
• 3D Tiles → picked 是 Cesium3DTileFeature
• Primitive → picked.primitive 是 Primitive

【要点】拾取顺序与渲染顺序一致（最上层优先）。`,

  'pick-position': () => `【原理】深度拾取 = 读取该像素在深度缓冲区的值，
反算回世界坐标。因此它得到的是“表面真实点”（模型/地形表面），
精度受深度缓冲位数限制。

【对比】
• pickPosition：真实表面点（含高程），需要深度纹理
• pickEllipsoid：椭球面点（忽略物体），永远可用

【要点】透明对象会被深度拾取穿透；大场景建议用
“pick 实体 + pickPosition 取点”的组合方案。`,

  'pick-ellipsoid': () => `【原理】camera.pickEllipsoid 从相机位置向屏幕点发射射线，
与 WGS84 椭球求交。它是“点到地球”的最快路径：
不依赖深度纹理、不关心场景内容。

【用途】点击空白处定位坐标、画点画线（量测类工具的核心）。`,

  'drill-pick': () => `【原理】drillPick 沿射线收集沿途所有命中（从近到远），
limit 限制最大数量。适合：
• 点选被遮挡对象（穿透选择）
• 批量统计/选取同位置要素

【要点】命中列表元素与 scene.pick 结构相同（id/primitive）。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" :type="activeFeature === 'pick-entity' ? 'primary' : 'default'" @click="setMode('pick-entity')">拾取实体</n-button>
      <n-button size="small" :type="activeFeature === 'pick-position' ? 'primary' : 'default'" @click="setMode('pick-position')">深度拾取</n-button>
      <n-button size="small" :type="activeFeature === 'pick-ellipsoid' ? 'primary' : 'default'" @click="setMode('pick-ellipsoid')">椭球面拾取</n-button>
      <n-button size="small" :type="activeFeature === 'drill-pick' ? 'primary' : 'default'" @click="setMode('drill-pick')">穿透拾取</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="picking-split"
      @split-change="onSplitChange"
    >
      <template #scene-overlay>
        <div class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white">{{ statusText }}</div>
      </template>
    </SplitViewer>
  </div>
</template>
