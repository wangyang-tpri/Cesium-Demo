<script setup lang="ts">
import { ref, provide, onBeforeUnmount } from "vue";
import * as Cesium from "cesium";
import SplitViewer from "@/components/base/SplitViewer.vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-img",
  camera: { position: [108.94, 34.2, 30000], pitch: -55 },
});

type DrawType = "point" | "line" | "polygon" | "circle" | "rectangle";
const activeFeature = ref<DrawType | "clear">("point");
const statusText = ref("图元绘制：选择绘制类型，在地图上点击绘制对应图元。");

interface DrawItem {
  id: number;
  type: DrawType;
  name: string;
  entity: Cesium.Entity;
}

const drawItems = ref<DrawItem[]>([]);
let drawIdCounter = 0;
let drawing = false;
let currentType: DrawType = "point";
let currentPositions: Cesium.Cartesian3[] = [];
let tempEntity: Cesium.Entity | null = null;
let handler: Cesium.ScreenSpaceEventHandler | null = null;
let circleCenter: Cesium.Cartesian3 | null = null;

const drawTypes = [
  { key: "point" as DrawType, label: "点", icon: "●" },
  { key: "line" as DrawType, label: "线", icon: "━" },
  { key: "polygon" as DrawType, label: "面", icon: "◢" },
  { key: "circle" as DrawType, label: "圆", icon: "○" },
  { key: "rectangle" as DrawType, label: "矩形", icon: "▭" },
];

function selectDrawType(type: DrawType) {
  stopDrawing();
  currentType = type;
  activeFeature.value = type;
  startDrawing();
  const names: Record<DrawType, string> = {
    point: "点",
    line: "折线",
    polygon: "多边形",
    circle: "圆",
    rectangle: "矩形",
  };
  statusText.value = `已选择「${names[type]}」绘制，${
    type === "point"
      ? "点击地图添加点"
      : type === "circle"
      ? "点击确定圆心，移动鼠标调整半径，再次点击完成"
      : type === "rectangle"
      ? "点击确定第一个角点，移动鼠标调整大小，再次点击完成"
      : "依次点击添加顶点，双击完成绘制"
  }`;
}

function startDrawing() {
  const v = viewer.value;
  if (!v) return;
  drawing = true;
  currentPositions = [];
  circleCenter = null;
  if (!handler) handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);

  handler.setInputAction((click: any) => {
    const cartesian = v.scene.pickPosition(click.position);
    if (!cartesian) return;

    if (currentType === "point") {
      addPoint(cartesian);
      return;
    }
    if (currentType === "circle") {
      if (!circleCenter) {
        circleCenter = cartesian;
        currentPositions = [cartesian];
      } else {
        finishCircle(cartesian);
      }
      return;
    }
    if (currentType === "rectangle") {
      if (currentPositions.length === 0) {
        currentPositions = [cartesian];
      } else {
        finishRectangle(cartesian);
      }
      return;
    }
    currentPositions.push(cartesian);
    updateTempShape();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  handler.setInputAction((move: any) => {
    const cartesian = v.scene.pickPosition(move.endPosition);
    if (!cartesian) return;
    if (currentType === "circle" && circleCenter) {
      updateTempCircle(cartesian);
    } else if (currentType === "rectangle" && currentPositions.length === 1) {
      updateTempRectangle(cartesian);
    } else if (
      (currentType === "line" || currentType === "polygon") &&
      currentPositions.length > 0
    ) {
      updateTempShape(cartesian);
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction(() => {
    if (currentType === "line" || currentType === "polygon") {
      if (currentPositions.length >= (currentType === "line" ? 2 : 3)) {
        finishShape();
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
}

function stopDrawing() {
  const v = viewer.value;
  drawing = false;
  if (tempEntity && v) {
    v.entities.remove(tempEntity);
    tempEntity = null;
  }
  currentPositions = [];
  circleCenter = null;
}

function addPoint(position: Cesium.Cartesian3) {
  const v = viewer.value;
  if (!v) return;
  const id = ++drawIdCounter;
  const entity = v.entities.add({
    position,
    point: {
      pixelSize: 12,
      color: Cesium.Color.RED,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
    },
    label: {
      text: `点${id}`,
      font: "12px sans-serif",
      pixelOffset: new Cesium.Cartesian2(0, -20),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    },
  });
  drawItems.value.push({ id, type: "point", name: `点${id}`, entity });
  statusText.value = `已添加点${id}`;
}

function updateTempShape(movePos?: Cesium.Cartesian3) {
  const v = viewer.value;
  if (!v) return;
  if (tempEntity) v.entities.remove(tempEntity);
  const positions = movePos ? [...currentPositions, movePos] : currentPositions;
  if (positions.length < 2) return;
  if (currentType === "line") {
    tempEntity = v.entities.add({
      polyline: {
        positions,
        width: 3,
        material: Cesium.Color.YELLOW.withAlpha(0.8),
        clampToGround: true,
      },
    });
  } else {
    tempEntity = v.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(positions),
        material: Cesium.Color.YELLOW.withAlpha(0.3),
        outline: true,
        outlineColor: Cesium.Color.YELLOW,
      },
    });
  }
}

function finishShape() {
  const v = viewer.value;
  if (!v) return;
  if (tempEntity) v.entities.remove(tempEntity);
  const id = ++drawIdCounter;
  const isLine = currentType === "line";
  const entity = v.entities.add(
    isLine
      ? {
          polyline: {
            positions: currentPositions,
            width: 4,
            material: Cesium.Color.BLUE,
            clampToGround: true,
          },
        }
      : {
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(currentPositions),
            material: Cesium.Color.BLUE.withAlpha(0.4),
            outline: true,
            outlineColor: Cesium.Color.BLUE,
          },
        }
  );
  const name = isLine ? `折线${id}` : `多边形${id}`;
  drawItems.value.push({ id, type: currentType, name, entity });
  statusText.value = `已绘制${name}，共${currentPositions.length}个顶点`;
  currentPositions = [];
}

function updateTempCircle(movePos: Cesium.Cartesian3) {
  const v = viewer.value;
  if (!v) return;
  if (tempEntity) v.entities.remove(tempEntity);
  if (!circleCenter) return;
  const radius = Cesium.Cartesian3.distance(circleCenter, movePos);
  tempEntity = v.entities.add({
    position: circleCenter,
    ellipse: {
      semiMinorAxis: radius,
      semiMajorAxis: radius,
      material: Cesium.Color.YELLOW.withAlpha(0.3),
      outline: true,
      outlineColor: Cesium.Color.YELLOW,
    },
  });
}

function finishCircle(movePos: Cesium.Cartesian3) {
  const v = viewer.value;
  if (!v) return;
  if (tempEntity) v.entities.remove(tempEntity);
  if (!circleCenter) return;
  const radius = Cesium.Cartesian3.distance(circleCenter, movePos);
  const id = ++drawIdCounter;
  const entity = v.entities.add({
    position: circleCenter,
    ellipse: {
      semiMinorAxis: radius,
      semiMajorAxis: radius,
      material: Cesium.Color.GREEN.withAlpha(0.4),
      outline: true,
      outlineColor: Cesium.Color.GREEN,
    },
    label: {
      text: `圆${id}`,
      font: "12px sans-serif",
      pixelOffset: new Cesium.Cartesian2(0, -10),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    },
  });
  drawItems.value.push({
    id,
    type: "circle",
    name: `圆${id}(r=${(radius / 1000).toFixed(2)}km)`,
    entity,
  });
  statusText.value = `已绘制圆${id}，半径 ${(radius / 1000).toFixed(2)} km`;
  circleCenter = null;
}

function updateTempRectangle(movePos: Cesium.Cartesian3) {
  const v = viewer.value;
  if (!v) return;
  if (tempEntity) v.entities.remove(tempEntity);
  if (currentPositions.length === 0) return;
  const p1 = Cesium.Cartographic.fromCartesian(currentPositions[0]);
  const p2 = Cesium.Cartographic.fromCartesian(movePos);
  tempEntity = v.entities.add({
    rectangle: {
      coordinates: Cesium.Rectangle.fromRadians(
        Math.min(p1.longitude, p2.longitude),
        Math.min(p1.latitude, p2.latitude),
        Math.max(p1.longitude, p2.longitude),
        Math.max(p1.latitude, p2.latitude)
      ),
      material: Cesium.Color.YELLOW.withAlpha(0.3),
      outline: true,
      outlineColor: Cesium.Color.YELLOW,
    },
  });
}

function finishRectangle(movePos: Cesium.Cartesian3) {
  const v = viewer.value;
  if (!v) return;
  if (tempEntity) v.entities.remove(tempEntity);
  if (currentPositions.length === 0) return;
  const p1 = Cesium.Cartographic.fromCartesian(currentPositions[0]);
  const p2 = Cesium.Cartographic.fromCartesian(movePos);
  const id = ++drawIdCounter;
  const entity = v.entities.add({
    rectangle: {
      coordinates: Cesium.Rectangle.fromRadians(
        Math.min(p1.longitude, p2.longitude),
        Math.min(p1.latitude, p2.latitude),
        Math.max(p1.longitude, p2.longitude),
        Math.max(p1.latitude, p2.latitude)
      ),
      material: Cesium.Color.ORANGE.withAlpha(0.4),
      outline: true,
      outlineColor: Cesium.Color.ORANGE,
    },
  });
  drawItems.value.push({ id, type: "rectangle", name: `矩形${id}`, entity });
  statusText.value = `已绘制矩形${id}`;
  currentPositions = [];
}

function applyClear() {
  const v = viewer.value;
  activeFeature.value = "clear";
  stopDrawing();
  if (handler) {
    handler.destroy();
    handler = null;
  }
  if (v) drawItems.value.forEach((item) => v.entities.remove(item.entity));
  drawItems.value = [];
  drawIdCounter = 0;
  statusText.value = "已清除所有图元，选择绘制类型重新开始。";
}

function removeItem(item: DrawItem) {
  const v = viewer.value;
  if (v) v.entities.remove(item.entity);
  drawItems.value = drawItems.value.filter((i) => i.id !== item.id);
  statusText.value = `已删除 ${item.name}`;
}

function flyToItem(item: DrawItem) {
  const v = viewer.value;
  if (v) v.flyTo(item.entity, { duration: 1.5 });
}

onBeforeUnmount(() => {
  stopDrawing();
  if (handler) handler.destroy();
  const v = viewer.value;
  if (v) drawItems.value.forEach((item) => v.entities.remove(item.entity));
});

const codeMap: Record<DrawType | "clear", () => string> = {
  point: () => `// 绘制点
handler.setInputAction((click) => {
  const cartesian = viewer.scene.pickPosition(click.position);
  viewer.entities.add({
    position: cartesian,
    point: { pixelSize: 12, color: Color.RED, outlineColor: Color.WHITE, outlineWidth: 2 },
    label: { text: '点' + id, pixelOffset: new Cartesian2(0, -20) },
  });
}, ScreenSpaceEventType.LEFT_CLICK);`,
  line: () => `// 绘制折线
let positions = [];
handler.setInputAction((click) => {
  positions.push(viewer.scene.pickPosition(click.position));
}, ScreenSpaceEventType.LEFT_CLICK);
// 双击完成
handler.setInputAction(() => {
  viewer.entities.add({
    polyline: { positions, width: 4, material: Color.BLUE, clampToGround: true },
  });
  positions = [];
}, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);`,
  polygon: () => `// 绘制多边形
let positions = [];
handler.setInputAction((click) => {
  positions.push(viewer.scene.pickPosition(click.position));
}, ScreenSpaceEventType.LEFT_CLICK);
handler.setInputAction(() => {
  viewer.entities.add({
    polygon: {
      hierarchy: new PolygonHierarchy(positions),
      material: Color.BLUE.withAlpha(0.4),
      outline: true, outlineColor: Color.BLUE,
    },
  });
}, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);`,
  circle: () => `// 绘制圆（椭圆）
let center = null;
handler.setInputAction((click) => {
  const pos = viewer.scene.pickPosition(click.position);
  if (!center) { center = pos; return; }
  const radius = Cartesian3.distance(center, pos);
  viewer.entities.add({
    position: center,
    ellipse: { semiMinorAxis: radius, semiMajorAxis: radius, material: Color.GREEN.withAlpha(0.4) },
  });
  center = null;
}, ScreenSpaceEventType.LEFT_CLICK);`,
  rectangle: () => `// 绘制矩形
let firstCorner = null;
handler.setInputAction((click) => {
  const pos = viewer.scene.pickPosition(click.position);
  if (!firstCorner) { firstCorner = pos; return; }
  const p1 = Cartographic.fromCartesian(firstCorner);
  const p2 = Cartographic.fromCartesian(pos);
  viewer.entities.add({
    rectangle: {
      coordinates: Rectangle.fromRadians(
        Math.min(p1.longitude, p2.longitude), Math.min(p1.latitude, p2.latitude),
        Math.max(p1.longitude, p2.longitude), Math.max(p1.latitude, p2.latitude)
      ),
      material: Color.ORANGE.withAlpha(0.4),
    },
  });
  firstCorner = null;
}, ScreenSpaceEventType.LEFT_CLICK);`,
  clear: () => `// 清除所有图元
drawItems.forEach(item => viewer.entities.remove(item.entity));
drawItems = [];
if (handler) { handler.destroy(); handler = null; }`,
};

const explainMap: Record<DrawType | "clear", () => string> = {
  point: () => `【原理】点绘制 = 点击事件 + point 实体：
1. 监听左键点击，scene.pickPosition 获取三维坐标
2. 添加 Entity.point 实体，设置像素大小、颜色、边框
3. 可选添加 label 标注点编号

【API】Entity.point: 点实体，pixelSize/color/outlineColor/outlineWidth`,
  line: () => `【原理】折线绘制 = 多点采集 + polyline 实体：
1. 依次点击采集顶点坐标
2. 鼠标移动时实时预览临时折线
3. 双击完成，添加 Entity.polyline 实体
4. clampToGround 使折线贴地显示

【API】Entity.polyline: 折线实体，positions/width/material/clampToGround`,
  polygon: () => `【原理】多边形绘制 = 多点采集 + polygon 实体：
1. 依次点击采集顶点（至少3个）
2. 鼠标移动时实时预览临时多边形
3. 双击完成，添加 Entity.polygon 实体
4. PolygonHierarchy 定义多边形顶点层次结构

【API】Entity.polygon: 多边形实体，hierarchy/material/outline`,
  circle: () => `【原理】圆绘制 = 圆心+半径 + ellipse 实体：
1. 第一次点击确定圆心
2. 移动鼠标调整半径，实时预览
3. 第二次点击完成，使用 Cartesian3.distance 计算半径
4. ellipse 实体的 semiMinorAxis=semiMajorAxis=半径 即为圆

【API】Entity.ellipse: 椭圆实体，semiMinorAxis/semiMajorAxis/material`,
  rectangle: () => `【原理】矩形绘制 = 对角点 + rectangle 实体：
1. 第一次点击确定第一个角点
2. 移动鼠标调整大小，实时预览
3. 第二次点击确定对角点
4. Cartographic.fromCartesian 转经纬度，Rectangle.fromRadians 构建矩形

【API】Entity.rectangle: 矩形实体，coordinates/material/outline`,
  clear: () => `【原理】清除 = 批量移除实体 + 销毁事件处理器：
1. 遍历 drawItems，逐个移除实体
2. 重置计数器和列表
3. 销毁 ScreenSpaceEventHandler

【要点】清除操作不可撤销。`,
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
        v-for="t in drawTypes"
        :key="t.key"
        size="small"
        :type="activeFeature === t.key ? 'primary' : 'default'"
        @click="selectDrawType(t.key)"
      >
        {{ t.icon }} {{ t.label }}
      </n-button>
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="primitive-draw-split"
    >
      <template #scene-overlay>
        <div
          class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white"
        >
          {{ statusText }}
        </div>
      </template>

      <template #bottom-panel>
        <div class="border-t border-gray-200 bg-gray-50 p-4">
          <div class="mb-2 flex items-center justify-between">
            <div class="text-sm font-semibold text-gray-700">已绘制图元</div>
            <div class="text-xs text-gray-500">
              共 <b class="text-blue-600">{{ drawItems.length }}</b> 个
            </div>
          </div>
          <div
            v-if="drawItems.length === 0"
            class="py-4 text-center text-xs text-gray-400"
          >
            选择绘制类型后在地图上绘制
          </div>
          <div v-else class="flex max-h-32 flex-wrap gap-2 overflow-auto">
            <div
              v-for="item in drawItems"
              :key="item.id"
              class="flex items-center gap-2 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs"
            >
              <span class="font-medium text-gray-700">{{ item.name }}</span>
              <n-button
                size="tiny"
                type="primary"
                quaternary
                @click="flyToItem(item)"
                >定位</n-button
              >
              <n-button
                size="tiny"
                type="error"
                quaternary
                @click="removeItem(item)"
                >删除</n-button
              >
            </div>
          </div>
        </div>
      </template>
    </SplitViewer>
  </div>
</template>
