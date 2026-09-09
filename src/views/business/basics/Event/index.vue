<script setup lang="ts">
import * as Cesium from 'cesium';
import { onMounted, ref, provide } from 'vue';
import { useCesiumViewer } from '@/hooks/useCesiumViewer';
import { useCodeExplain } from '@/hooks/useCodeExplain';
import SplitViewer from '@/components/base/SplitViewer.vue';

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref('click');
const statusText = ref('事件系统：左键点击实体 / 移动鼠标 / 双击地球体验。');

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: 'esri',
  camera: { position: [108.94, 34.34, 5000], pitch: -55 },
});

// 分割条拖拽时通知 viewer 重新计算渲染尺寸
function onSplitChange() {
  viewer.value?.resize();
}

let handler: Cesium.ScreenSpaceEventHandler | null = null;
let selected: Cesium.Entity | null = null;
let marker: Cesium.Entity | null = null;
let pickedFlag = false;

// 预置可拾取的实体
const PICKABLES = [
  { name: '钟楼', lon: 108.94, lat: 34.342, h: 40, color: '#e74c3c' },
  { name: '鼓楼', lon: 108.935, lat: 34.343, h: 35, color: '#f39c12' },
  { name: '大雁塔', lon: 108.97, lat: 34.218, h: 65, color: '#9b59b6' },
  { name: '南门城楼', lon: 108.947, lat: 34.338, h: 30, color: '#27ae60' },
];

onMounted(() => {
  const v = viewer.value;
  if (!v) return;

  for (const p of PICKABLES) {
    v.entities.add({
      id: p.name,
      position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.h / 2),
      box: {
        dimensions: new Cesium.Cartesian3(50, 50, p.h),
        material: Cesium.Color.fromCssColorString(p.color).withAlpha(0.85),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
      },
      label: {
        text: p.name,
        font: '14px Microsoft YaHei, sans-serif',
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

  // ① 左键拾取实体
  handler.setInputAction((e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    activeFeature.value = 'click';
    const picked = v.scene.pick(e.position);
    if (Cesium.defined(picked) && picked.id instanceof Cesium.Entity) {
      const entity = picked.id as Cesium.Entity;
      highlight(entity);
      const pos = (entity.position as Cesium.ConstantPositionProperty).getValue(Cesium.JulianDate.now());
      const carto = pos ? Cesium.Cartographic.fromCartesian(pos) : null;
      const coord = carto
        ? `经度 ${Cesium.Math.toDegrees(carto.longitude).toFixed(5)}°，纬度 ${Cesium.Math.toDegrees(carto.latitude).toFixed(5)}°`
        : '';
      statusText.value = `拾取到实体【${String(entity.id)}】：${coord}`;
    } else {
      clearHighlight();
      statusText.value = '点击处无实体（可用“深度拾取”功能获取地形坐标）';
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // ② 鼠标移动 → 屏幕坐标 + 地理坐标
  handler.setInputAction((e: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    if (activeFeature.value !== 'move') return;
    const cartesian = v.camera.pickEllipsoid(e.endPosition, v.scene.globe.ellipsoid);
    if (cartesian) {
      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      statusText.value =
        `屏幕 (${e.endPosition.x.toFixed(0)}, ${e.endPosition.y.toFixed(0)}) → ` +
        `经度 ${Cesium.Math.toDegrees(carto.longitude).toFixed(4)}°，` +
        `纬度 ${Cesium.Math.toDegrees(carto.latitude).toFixed(4)}°`;
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // ④ 双击 → 飞行到该点
  handler.setInputAction((e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    activeFeature.value = 'dblclick';
    const cartesian = v.camera.pickEllipsoid(e.position, v.scene.globe.ellipsoid);
    if (!cartesian) return;
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        Cesium.Math.toDegrees(Cesium.Cartographic.fromCartesian(cartesian).longitude),
        Cesium.Math.toDegrees(Cesium.Cartographic.fromCartesian(cartesian).latitude),
        2000
      ),
      duration: 1.2,
    });
    statusText.value = '双击：飞行至点击点（高度 2000m）';
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
});

function highlight(entity: Cesium.Entity) {
  clearHighlight();
  selected = entity;
  const box = entity.box;
  if (box && box.material instanceof Cesium.ColorMaterialProperty) {
    box.material = new Cesium.ColorMaterialProperty(Cesium.Color.YELLOW.withAlpha(0.95));
  }
  // 选中框线提示：在实体周围添加白色描边 box
  const pos = (entity.position as Cesium.ConstantPositionProperty).getValue(Cesium.JulianDate.now());
  if (pos) {
    const dim = entity.box?.dimensions?.getValue(Cesium.JulianDate.now()) ?? new Cesium.Cartesian3(50, 50, 40);
    marker = viewer.value?.entities.add({
      position: pos,
      box: {
        dimensions: Cesium.Cartesian3.add(dim, new Cesium.Cartesian3(8, 8, 8), new Cesium.Cartesian3()),
        material: Cesium.Color.TRANSPARENT,
        outline: true,
        outlineColor: Cesium.Color.YELLOW,
        outlineWidth: 2,
      },
    }) ?? null;
  }
}

function clearHighlight() {
  if (selected) {
    const id = String(selected.id);
    const found = PICKABLES.find((p) => p.name === id);
    if (found && selected.box?.material instanceof Cesium.ColorMaterialProperty) {
      selected.box.material = new Cesium.ColorMaterialProperty(
        Cesium.Color.fromCssColorString(found.color).withAlpha(0.85)
      );
    }
    selected = null;
  }
  if (marker && viewer.value) {
    viewer.value.entities.remove(marker);
    marker = null;
  }
}

function applyMove() {
  activeFeature.value = 'move';
  statusText.value = '移动鼠标：实时显示屏幕坐标与地理坐标';
}

function applyPickPosition() {
  activeFeature.value = 'pick-position';
  pickedFlag = !pickedFlag;
  statusText.value = pickedFlag
    ? '深度拾取已开启：点击任意位置，显示模型/地形表面世界坐标'
    : '深度拾取已关闭（左键仍可拾取实体）';
}

function applyDblClick() {
  activeFeature.value = 'dblclick';
  statusText.value = '双击已开启：双击地球任意位置飞行过去';
}

function applyClear() {
  activeFeature.value = 'click';
  clearHighlight();
  statusText.value = '已清除选中状态';
}

const codeMap: Record<string, () => string> = {
  click: () => `// ① 左键拾取实体（scene.pick）
const handler = new Cesium.ScreenSpaceEventHandler(
  viewer.scene.canvas)
handler.setInputAction((e) => {
  const picked = viewer.scene.pick(e.position)
  if (Cesium.defined(picked) && picked.id) {
    console.log(picked.id)          // 实体/要素
    picked.id.box.material = ...    // 高亮
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK)`,

  move: () => `// ② 鼠标移动：屏幕坐标 → 地理坐标
handler.setInputAction((e) => {
  const cartesian = viewer.camera.pickEllipsoid(
    e.endPosition, viewer.scene.globe.ellipsoid)
  const carto = Cesium.Cartographic.fromCartesian(cartesian)
  // 屏幕(e.endPosition) → 经纬度
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE)`,

  'pick-position': () => `// ③ 深度拾取：模型/地形表面的世界坐标
handler.setInputAction((e) => {
  // 读深度缓冲区，得到命中点的真实世界坐标
  const cartesian = viewer.scene.pickPosition(e.position)
  const carto = Cesium.Cartographic.fromCartesian(cartesian)
  // 与 camera.pickEllipsoid 的区别：
  // pickEllipsoid 只算椭球面（忽略模型/地形高度）
}, Cesium.ScreenSpaceEventType.LEFT_CLICK)`,

  dblclick: () => `// ④ 双击事件：飞行到点击点
handler.setInputAction((e) => {
  const cartesian = viewer.camera.pickEllipsoid(
    e.position, viewer.scene.globe.ellipsoid)
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      lon, lat, 2000),
    duration: 1.2,
  })
}, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)`,

  clear: () => `// 清除事件监听
handler.destroy()
// 或按事件类型移除
handler.removeInputAction(
  Cesium.ScreenSpaceEventType.LEFT_CLICK)`,
};

const explainMap: Record<string, () => string> = {
  click: () => `【原理】ScreenSpaceEventHandler 统一管理鼠标/触控事件，
事件类型：LEFT_CLICK / RIGHT_CLICK / MOUSE_MOVE / LEFT_DOWN / LEFT_UP
/ WHEEL / LEFT_DOUBLE_CLICK 等。

scene.pick(position) 返回该像素命中的对象：
• picked.id：Entity / Primitive / Cesium3DTileFeature 等
• picked.primitive：命中的几何体

【要点】拾取是在渲染后对像素做“反查询”，开销小、命中准。`,

  move: () => `【原理】MOUSE_MOVE 每帧触发（高频），适合：
• 鼠标跟随显示经纬度
• hover 高亮（配合 scene.pick）
• 拖拽绘制

【性能】回调里避免做重活；只读操作无压力。`,

  'pick-position': () => `【原理】scene.pickPosition 读取深度缓冲区的深度值，
还原出该像素在模型/地形表面的真实世界坐标（有高程）。
对比：
• pickEllipsoid → 椭球面交点（忽略地形与模型）
• pickPosition → 表面真实点（需要深度纹理支持）

【要点】深度拾取要求 WebGL 深度纹理；对透明物体会穿透。`,

  dblclick: () => `【原理】双击事件由 LEFT_DOUBLE_CLICK 触发。
注意：双击会先触发两次 LEFT_CLICK，业务上常用定时器区分。

【要点】事件组合可实现完整的“点选-详情-导航”交互闭环。`,

  clear: () => `【原理】handler.destroy() 一次性移除所有监听；
removeInputAction(type) 按事件类型移除。

【要点】页面销毁时务必清理事件，避免内存泄漏（本页 onBeforeUnmount 已处理）。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" :type="activeFeature === 'click' ? 'primary' : 'default'" @click="activeFeature = 'click'">拾取实体（点击试试）</n-button>
      <n-button size="small" :type="activeFeature === 'move' ? 'primary' : 'default'" @click="applyMove">鼠标移动取坐标</n-button>
      <n-button size="small" :type="activeFeature === 'pick-position' ? 'primary' : 'default'" @click="applyPickPosition">深度拾取：{{ pickedFlag ? '开' : '关' }}</n-button>
      <n-button size="small" :type="activeFeature === 'dblclick' ? 'primary' : 'default'" @click="applyDblClick">双击飞行（双击试试）</n-button>
      <n-button size="small" quaternary @click="applyClear">清除选中</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="event-split"
      @split-change="onSplitChange"
    >
      <template #scene-overlay>
        <div class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white">{{ statusText }}</div>
      </template>
    </SplitViewer>
  </div>
</template>
