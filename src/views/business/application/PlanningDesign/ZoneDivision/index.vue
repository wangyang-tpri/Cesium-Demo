<script setup lang="ts">
import { ref, provide, onBeforeUnmount } from 'vue';
import * as Cesium from 'cesium';
import SplitViewer from '@/components/base/SplitViewer.vue';
import { useCesiumViewer } from '@/hooks/useCesiumViewer';
import { useCodeExplain } from '@/hooks/useCodeExplain';

const containerRef = ref<HTMLDivElement | null>(null);
provide('splitViewerContainerRef', containerRef);

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: 'tianditu-img',
  camera: { position: [108.94, 34.2, 30000], pitch: -55 },
});

const activeFeature = ref<'draw' | 'clear'>('draw');
const statusText = ref('区域划分：点击「开始绘制」，在地图上依次点击添加多边形顶点，双击完成绘制。');

// 区域列表
interface Zone {
  id: number;
  name: string;
  positions: Cesium.Cartesian3[];
  hierarchy: Cesium.PolygonHierarchy;
  color: string;
  area: number;
  perimeter: number;
  vertexCount: number;
}

const zones = ref<Zone[]>([]);
let zoneIdCounter = 0;
let drawing = false;
let currentPositions: Cesium.Cartesian3[] = [];
let tempPolygon: Cesium.Entity | null = null;
let handler: Cesium.ScreenSpaceEventHandler | null = null;

// 预设颜色
const zoneColors = [
  '#18a058', '#2080f0', '#f0a020', '#d03050',
  '#0fc6c2', '#7c3aed', '#f59e0b', '#10b981',
];

// 总统计
const totalStats = ref({
  zoneCount: 0,
  totalArea: 0,
});

onBeforeUnmount(() => {
  if (handler) {
    handler.destroy();
    handler = null;
  }
});

function startDrawing() {
  drawing = true;
  currentPositions = [];
  statusText.value = "绘制模式：点击地图添加多边形顶点（至少3个），双击完成绘制。";
  if (!handler) {
    const v = viewer.value!;
    handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);

    // 左键点击添加顶点
    handler.setInputAction((click: any) => {
      if (!drawing) return;
      const v = viewer.value!;
      const cartesian = v.scene.pickPosition(click.position);
      if (!cartesian) return;
      currentPositions.push(cartesian);
      updateTempPolygon();
      statusText.value = `已添加 ${currentPositions.length} 个顶点，继续点击或双击完成绘制。`;
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // 鼠标移动更新临时多边形
    handler.setInputAction((move: any) => {
      if (!drawing || currentPositions.length === 0) return;
      const v = viewer.value!;
      const cartesian = v.scene.pickPosition(move.endPosition);
      if (!cartesian) return;
      updateTempPolygon(cartesian);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // 双击完成绘制
    handler.setInputAction(() => {
      if (!drawing) return;
      if (currentPositions.length < 3) {
        statusText.value = "至少需要3个顶点才能形成多边形，请继续添加顶点。";
        return;
      }
      finishDrawing();
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  }
}

function updateTempPolygon(mousePos?: Cesium.Cartesian3) {
  const v = viewer.value!;
  if (tempPolygon) {
    v.entities.remove(tempPolygon);
    tempPolygon = null;
  }
  if (currentPositions.length === 0) return;

  const positions = [...currentPositions];
  if (mousePos) positions.push(mousePos);

  tempPolygon = v.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(positions),
      material: Cesium.Color.fromCssColorString('#2080f0').withAlpha(0.3),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#2080f0'),
      outlineWidth: 2,
    },
    polyline: {
      positions: positions,
      width: 2,
      material: Cesium.Color.fromCssColorString('#2080f0'),
      clampToGround: true,
    },
  });
}

function finishDrawing() {
  drawing = false;
  const v = viewer.value!;

  // 清除临时多边形
  if (tempPolygon) {
    v.entities.remove(tempPolygon);
    tempPolygon = null;
  }

  const color = zoneColors[zoneIdCounter % zoneColors.length];
  const hierarchy = new Cesium.PolygonHierarchy([...currentPositions]);

  // 计算面积和周长
  const area = calculatePolygonArea(currentPositions);
  const perimeter = calculatePerimeter(currentPositions);

  const zone: Zone = {
    id: ++zoneIdCounter,
    name: `区域${zoneIdCounter}`,
    positions: [...currentPositions],
    hierarchy: hierarchy,
    color: color,
    area: area,
    perimeter: perimeter,
    vertexCount: currentPositions.length,
  };

  zones.value.push(zone);

  // 添加永久多边形
  v.entities.add({
    id: `zone-${zone.id}`,
    name: zone.name,
    polygon: {
      hierarchy: hierarchy,
      material: Cesium.Color.fromCssColorString(color).withAlpha(0.4),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString(color),
      outlineWidth: 2,
    },
    label: {
      text: zone.name,
      font: '14px sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, 0),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    },
  });

  // 更新统计
  totalStats.value.zoneCount = zones.value.length;
  totalStats.value.totalArea = zones.value.reduce((sum, z) => sum + z.area, 0);

  currentPositions = [];
  statusText.value = `「${zone.name}」绘制完成：面积 ${(area / 1000000).toFixed(4)} km²，周长 ${(perimeter / 1000).toFixed(2)} km，${zone.vertexCount} 个顶点。`;
}

// 球面多边形面积计算（基于经纬度的球面三角剖分）
function calculatePolygonArea(positions: Cesium.Cartesian3[]): number {
  if (positions.length < 3) return 0;

  const R = 6378137; // 地球半径（米）
  let totalAngle = 0;

  for (let i = 0; i < positions.length; i++) {
    const p1 = Cesium.Cartographic.fromCartesian(positions[i]);
    const p2 = Cesium.Cartographic.fromCartesian(positions[(i + 1) % positions.length]);

    const lon1 = p1.longitude;
    const lat1 = p1.latitude;
    const lon2 = p2.longitude;
    const lat2 = p2.latitude;

    totalAngle += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  return Math.abs((totalAngle * R * R) / 2);
}

// 周长计算
function calculatePerimeter(positions: Cesium.Cartesian3[]): number {
  let perimeter = 0;
  for (let i = 0; i < positions.length; i++) {
    perimeter += Cesium.Cartesian3.distance(
      positions[i],
      positions[(i + 1) % positions.length]
    );
  }
  return perimeter;
}

function removeZone(zoneId: number) {
  const v = viewer.value!;
  const entity = v.entities.getById(`zone-${zoneId}`);
  if (entity) v.entities.remove(entity);

  const idx = zones.value.findIndex(z => z.id === zoneId);
  if (idx >= 0) {
    const zoneName = zones.value[idx].name;
    zones.value.splice(idx, 1);
    totalStats.value.zoneCount = zones.value.length;
    totalStats.value.totalArea = zones.value.reduce((sum, z) => sum + z.area, 0);
    statusText.value = `已删除「${zoneName}」，当前共 ${zones.value.length} 个区域。`;
  }
}

function flyToZone(zoneId: number) {
  const v = viewer.value!;
  const zone = zones.value.find(z => z.id === zoneId);
  if (!zone) return;
  const entity = v.entities.getById(`zone-${zoneId}`);
  if (entity) {
    v.flyTo(entity, {
      offset: new Cesium.HeadingPitchRange(0, -Math.PI / 4, Math.max(zone.area / 1000, 2000)),
    });
  }
}

function clearAll() {
  const v = viewer.value!;
  zones.value.forEach(zone => {
    const entity = v.entities.getById(`zone-${zone.id}`);
    if (entity) v.entities.remove(entity);
  });
  zones.value = [];
  zoneIdCounter = 0;
  currentPositions = [];
  if (tempPolygon) {
    v.entities.remove(tempPolygon);
    tempPolygon = null;
  }
  totalStats.value = { zoneCount: 0, totalArea: 0 };
}

function applyDraw() {
  activeFeature.value = 'draw';
  startDrawing();
}

function applyClear() {
  activeFeature.value = 'clear';
  drawing = false;
  clearAll();
  statusText.value = "已清除所有区域，点击「开始绘制」重新划分区域。";
}

const codeMap: Record<'draw' | 'clear', () => string> = {
  draw: () => `// 1. 点击添加多边形顶点
handler.setInputAction((click) => {
  const cartesian = viewer.scene.pickPosition(click.position);
  currentPositions.push(cartesian);
  updateTempPolygon();
}, ScreenSpaceEventType.LEFT_CLICK);

// 2. 鼠标移动实时预览
handler.setInputAction((move) => {
  const cartesian = viewer.scene.pickPosition(move.endPosition);
  updateTempPolygon(cartesian);
}, ScreenSpaceEventType.MOUSE_MOVE);

// 3. 双击完成绘制
handler.setInputAction(() => {
  if (currentPositions.length >= 3) finishDrawing();
}, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

// 4. 添加永久多边形
viewer.entities.add({
  polygon: {
    hierarchy: new PolygonHierarchy(positions),
    material: Color.BLUE.withAlpha(0.4),
    outline: true,
  },
  label: { text: zoneName, heightReference: HeightReference.CLAMP_TO_GROUND },
});

// 5. 球面多边形面积计算
function calculatePolygonArea(positions) {
  const R = 6378137;
  let totalAngle = 0;
  for (let i = 0; i < positions.length; i++) {
    const p1 = Cartographic.fromCartesian(positions[i]);
    const p2 = Cartographic.fromCartesian(positions[(i + 1) % positions.length]);
    totalAngle += (p2.longitude - p1.longitude) *
      (2 + Math.sin(p1.latitude) + Math.sin(p2.latitude));
  }
  return Math.abs((totalAngle * R * R) / 2);
}`,
  clear: () => `// 清除所有区域
zones.forEach(zone => {
  const entity = viewer.entities.getById(\`zone-\${zone.id}\`);
  if (entity) viewer.entities.remove(entity);
});
zones = [];
zoneIdCounter = 0;`,
};

const explainMap: Record<'draw' | 'clear', () => string> = {
  draw: () => `【原理】区域划分 = 多边形绘制 + 球面面积计算 + 多区域管理：
1. 用户在地图上依次点击添加多边形顶点，实时预览临时多边形
2. 双击完成绘制，生成永久多边形区域并自动编号
3. 使用球面多边形面积公式计算区域面积（基于经纬度的球面三角剖分）
4. 使用 Cartesian3.distance 累加计算多边形周长
5. 每个区域使用不同颜色区分，支持单独删除和飞行定位

【API】
• PolygonHierarchy: 多边形层次结构，定义多边形顶点
• Entity.polygon: 多边形实体，material 填充、outline 边框
• HeightReference.CLAMP_TO_GROUND: 标签贴地显示
• Cartographic.fromCartesian: 笛卡尔坐标转地理坐标（经纬度弧度）
• 球面面积公式: area = R² * |Σ(Δλ * (2 + sinφ1 + sinφ2))| / 2
• viewer.flyTo(entity): 飞行到指定实体视角`,
  clear: () => `【原理】清除 = 批量移除实体 + 重置数据：
1. 遍历 zones 数组，通过 entity id 获取并移除每个区域实体
2. 重置 zones、zoneIdCounter 等数据
3. 清除临时多边形和当前顶点

【要点】清除操作会移除所有区域，不可撤销。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" type="success" @click="applyDraw">开始绘制</n-button>
      <n-button size="small" quaternary @click="applyClear">清除全部</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="zone-division-split"
    >
      <template #scene-overlay>
        <div class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white">
          {{ statusText }}
        </div>
      </template>

    <template #bottom-panel>
      <div class="border-t border-gray-200 bg-gray-50 p-4">
        <div class="mb-3 flex items-center justify-between">
          <div class="text-sm font-semibold text-gray-700">区域统计</div>
          <div class="flex gap-4 text-xs text-gray-500">
            <span>共 <b class="text-blue-600">{{ totalStats.zoneCount }}</b> 个区域</span>
            <span>总面积 <b class="text-green-600">{{ (totalStats.totalArea / 1000000).toFixed(4) }}</b> km²</span>
          </div>
        </div>
        <div v-if="zones.length === 0" class="py-4 text-center text-xs text-gray-400">
          暂无区域，点击「开始绘制」在地图上绘制多边形
        </div>
        <div v-else class="max-h-48 space-y-2 overflow-auto">
          <div
            v-for="zone in zones"
            :key="zone.id"
            class="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-2"
          >
            <div
              class="h-4 w-4 flex-shrink-0 rounded"
              :style="{ backgroundColor: zone.color }"
            ></div>
            <div class="flex-1">
              <div class="text-xs font-semibold text-gray-700">{{ zone.name }}</div>
              <div class="text-xs text-gray-500">
                面积 {{ (zone.area / 1000000).toFixed(4) }} km² ·
                周长 {{ (zone.perimeter / 1000).toFixed(2) }} km ·
                {{ zone.vertexCount }} 顶点
              </div>
            </div>
            <n-button size="tiny" type="primary" quaternary @click="flyToZone(zone.id)">定位</n-button>
            <n-button size="tiny" type="error" quaternary @click="removeZone(zone.id)">删除</n-button>
          </div>
        </div>
      </div>
    </template>
    </SplitViewer>
  </div>
</template>
