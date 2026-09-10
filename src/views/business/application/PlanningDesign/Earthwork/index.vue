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

const activeFeature = ref<'draw' | 'calculate' | 'clear'>('draw');
const statusText = ref('土方计算：点击「开始绘制」，在地图上绘制设计范围多边形，设置设计高程后点击「计算土方」。');

// 设计高程（米）
const designElevation = ref(50);
// 网格密度
const gridDensity = ref(15);
// 计算中
const calculating = ref(false);

// 多边形顶点
let currentPositions: Cesium.Cartesian3[] = [];
let tempPolygon: Cesium.Entity | null = null;
let designPolygon: Cesium.Entity | null = null;
let gridEntities: Cesium.Entity[] = [];
let handler: Cesium.ScreenSpaceEventHandler | null = null;
let drawing = false;
let polygonDrawn = false;

// 土方统计
const earthworkStats = ref({
  cutVolume: 0,
  fillVolume: 0,
  balance: 0,
  gridCount: 0,
  cutGridCount: 0,
  fillGridCount: 0,
  avgOriginalElevation: 0,
});

onBeforeUnmount(() => {
  if (handler) {
    handler.destroy();
    handler = null;
  }
});

function startDrawing() {
  clearResults();
  drawing = true;
  polygonDrawn = false;
  currentPositions = [];
  statusText.value = "绘制模式：点击地图添加多边形顶点（至少3个），双击完成绘制。";

  if (!handler) {
    const v = viewer.value!;
    handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);

    handler.setInputAction((click: any) => {
      if (!drawing) return;
      const v = viewer.value!;
      const cartesian = v.scene.pickPosition(click.position);
      if (!cartesian) return;
      currentPositions.push(cartesian);
      updateTempPolygon();
      statusText.value = `已添加 ${currentPositions.length} 个顶点，继续点击或双击完成绘制。`;
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((move: any) => {
      if (!drawing || currentPositions.length === 0) return;
      const v = viewer.value!;
      const cartesian = v.scene.pickPosition(move.endPosition);
      if (!cartesian) return;
      updateTempPolygon(cartesian);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

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
      material: Cesium.Color.fromCssColorString('#d03050').withAlpha(0.2),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#d03050'),
      outlineWidth: 2,
    },
  });
}

function finishDrawing() {
  drawing = false;
  polygonDrawn = true;
  const v = viewer.value!;

  if (tempPolygon) {
    v.entities.remove(tempPolygon);
    tempPolygon = null;
  }

  designPolygon = v.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy([...currentPositions]),
      material: Cesium.Color.fromCssColorString('#d03050').withAlpha(0.15),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#d03050'),
      outlineWidth: 3,
    },
    label: {
      text: '设计范围',
      font: '14px sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    },
  });

  statusText.value = `设计范围已绘制（${currentPositions.length} 个顶点）。设置设计高程后点击「计算土方」。`;
}

async function calculateEarthwork() {
  if (!polygonDrawn || currentPositions.length < 3) {
    statusText.value = "请先绘制设计范围多边形。";
    return;
  }

  calculating.value = true;
  statusText.value = "正在计算土方量，请稍候...";

  try {
    const v = viewer.value!;

    // 清除旧的网格
    clearGrid();

    // 计算多边形边界框
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    currentPositions.forEach(pos => {
      const carto = Cesium.Cartographic.fromCartesian(pos);
      const lon = Cesium.Math.toDegrees(carto.longitude);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });

    // 生成网格点
    const n = gridDensity.value;
    const gridPoints: Cesium.Cartographic[] = [];
    const gridInfo: { lon: number; lat: number; inPolygon: boolean }[] = [];

    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const lon = minLon + (maxLon - minLon) * (i / n);
        const lat = minLat + (maxLat - minLat) * (j / n);
        const inPoly = pointInPolygon(lon, lat);
        gridInfo.push({ lon, lat, inPolygon: inPoly });
        if (inPoly) {
          gridPoints.push(Cesium.Cartographic.fromDegrees(lon, lat));
        }
      }
    }

    // 高精度地形采样
    const terrainProvider = v.terrainProvider;
    const sampledPositions = await Cesium.sampleTerrainMostDetailed(terrainProvider, gridPoints);

    // 计算网格面积（近似）
    const cellWidth = (maxLon - minLon) / n;
    const cellHeight = (maxLat - minLat) / n;
    const avgLat = (minLat + maxLat) / 2;
    const cellArea = (cellWidth * 111320 * Math.cos(Cesium.Math.toRadians(avgLat))) * (cellHeight * 110540);

    // 计算挖填方
    let cutVolume = 0;
    let fillVolume = 0;
    let cutCount = 0;
    let fillCount = 0;
    let totalElevation = 0;
    let validCount = 0;

    sampledPositions.forEach((carto, idx) => {
      const originalHeight = carto.height;
      if (isNaN(originalHeight)) return;

      totalElevation += originalHeight;
      validCount++;

      const diff = originalHeight - designElevation.value;
      const volume = Math.abs(diff) * cellArea;

      if (diff > 0.1) {
        // 挖方
        cutVolume += volume;
        cutCount++;
        addGridEntity(gridPoints[idx], originalHeight, designElevation.value, 'cut');
      } else if (diff < -0.1) {
        // 填方
        fillVolume += volume;
        fillCount++;
        addGridEntity(gridPoints[idx], originalHeight, designElevation.value, 'fill');
      }
    });

    earthworkStats.value = {
      cutVolume: cutVolume,
      fillVolume: fillVolume,
      balance: cutVolume - fillVolume,
      gridCount: validCount,
      cutGridCount: cutCount,
      fillGridCount: fillCount,
      avgOriginalElevation: validCount > 0 ? totalElevation / validCount : 0,
    };

    const balanceText = earthworkStats.value.balance > 0
      ? `余方 ${(earthworkStats.value.balance / 10000).toFixed(2)} 万m³（需外运）`
      : earthworkStats.value.balance < 0
        ? `缺方 ${(Math.abs(earthworkStats.value.balance) / 10000).toFixed(2)} 万m³（需取土）`
        : '挖填平衡';

    statusText.value = `土方计算完成：挖方 ${(cutVolume / 10000).toFixed(2)} 万m³，填方 ${(fillVolume / 10000).toFixed(2)} 万m³，${balanceText}。`;

  } catch (err) {
    console.error('土方计算失败:', err);
    statusText.value = "土方计算失败，请重试。";
  } finally {
    calculating.value = false;
  }
}

// 点在多边形内判断（射线法）
function pointInPolygon(lon: number, lat: number): boolean {
  let inside = false;
  const vertices = currentPositions.map(p => {
    const c = Cesium.Cartographic.fromCartesian(p);
    return { lon: Cesium.Math.toDegrees(c.longitude), lat: Cesium.Math.toDegrees(c.latitude) };
  });

  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].lon, yi = vertices[i].lat;
    const xj = vertices[j].lon, yj = vertices[j].lat;
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function addGridEntity(carto: Cesium.Cartographic, originalH: number, designH: number, type: 'cut' | 'fill') {
  const v = viewer.value!;
  const color = type === 'cut'
    ? Cesium.Color.fromCssColorString('#d03050').withAlpha(0.5)
    : Cesium.Color.fromCssColorString('#2080f0').withAlpha(0.5);

  const entity = v.entities.add({
    position: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, Math.max(originalH, designH) + 1),
    point: {
      pixelSize: 6,
      color: color,
      outlineColor: type === 'cut' ? Cesium.Color.fromCssColorString('#d03050') : Cesium.Color.fromCssColorString('#2080f0'),
      outlineWidth: 1,
    },
  });
  gridEntities.push(entity);
}

function clearGrid() {
  const v = viewer.value!;
  gridEntities.forEach(e => v.entities.remove(e));
  gridEntities = [];
}

function clearResults() {
  const v = viewer.value!;
  clearGrid();
  if (designPolygon) {
    v.entities.remove(designPolygon);
    designPolygon = null;
  }
  if (tempPolygon) {
    v.entities.remove(tempPolygon);
    tempPolygon = null;
  }
  currentPositions = [];
  polygonDrawn = false;
  earthworkStats.value = {
    cutVolume: 0, fillVolume: 0, balance: 0,
    gridCount: 0, cutGridCount: 0, fillGridCount: 0, avgOriginalElevation: 0,
  };
}

function applyDraw() {
  activeFeature.value = 'draw';
  startDrawing();
}

function applyCalculate() {
  activeFeature.value = 'calculate';
  calculateEarthwork();
}

function applyClear() {
  activeFeature.value = 'clear';
  drawing = false;
  clearResults();
  statusText.value = "已清除，点击「开始绘制」重新绘制设计范围。";
}

const codeMap: Record<'draw' | 'calculate' | 'clear', () => string> = {
  draw: () => `// 1. 绘制设计范围多边形
handler.setInputAction((click) => {
  const cartesian = viewer.scene.pickPosition(click.position);
  currentPositions.push(cartesian);
}, ScreenSpaceEventType.LEFT_CLICK);

// 双击完成
handler.setInputAction(() => {
  if (currentPositions.length >= 3) finishDrawing();
}, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

// 2. 添加设计范围实体
viewer.entities.add({
  polygon: {
    hierarchy: new PolygonHierarchy(positions),
    material: Color.RED.withAlpha(0.15),
    outline: true,
  },
});`,
  calculate: () => `// 3. 生成网格并判断点在多边形内
for (let i = 0; i <= n; i++) {
  for (let j = 0; j <= n; j++) {
    const lon = minLon + (maxLon - minLon) * (i / n);
    const lat = minLat + (maxLat - minLat) * (j / n);
    if (pointInPolygon(lon, lat)) {
      gridPoints.push(Cartographic.fromDegrees(lon, lat));
    }
  }
}

// 4. 高精度地形采样
const sampled = await sampleTerrainMostDetailed(
  terrainProvider, gridPoints
);

// 5. 计算挖填方
sampled.forEach(carto => {
  const diff = carto.height - designElevation;
  const volume = Math.abs(diff) * cellArea;
  if (diff > 0) cutVolume += volume;   // 挖方（红色）
  else fillVolume += volume;             // 填方（蓝色）
});`,
  clear: () => `// 清除所有结果
gridEntities.forEach(e => viewer.entities.remove(e));
gridEntities = [];
if (designPolygon) {
  viewer.entities.remove(designPolygon);
  designPolygon = null;
}
currentPositions = [];
earthworkStats = { cutVolume: 0, fillVolume: 0, ... };`,
};

const explainMap: Record<'draw' | 'calculate' | 'clear', () => string> = {
  draw: () => `【原理】设计范围绘制 = 多边形顶点采集 + 实体标记：
1. 使用 ScreenSpaceEventHandler 监听地图左键点击事件
2. scene.pickPosition 从屏幕坐标获取三维空间坐标
3. 双击完成绘制，生成永久多边形区域
4. 添加 polygon 实体，半透明填充 + 边框标记设计范围

【API】
• ScreenSpaceEventHandler: 屏幕空间事件处理器
• scene.pickPosition: 屏幕坐标转三维坐标
• Entity.polygon: 多边形实体
• PolygonHierarchy: 多边形层次结构`,
  calculate: () => `【原理】土方计算 = 网格地形采样 + 挖填方体积计算：
1. 在设计范围内生成 N×N 网格，使用射线法判断网格点是否在多边形内
2. 对多边形内的网格点使用 sampleTerrainMostDetailed 获取高精度原地形高程
3. 比较原地形高程与设计高程：原地形>设计高程为挖方，反之为填方
4. 每个网格的挖填方量 = 高程差 × 网格面积（基于经纬度的近似面积）
5. 汇总总挖方量和总填方量，计算土方平衡（挖方-填方=余缺）
6. 地图上用红色点标记挖方网格，蓝色点标记填方网格

【API】
• sampleTerrainMostDetailed: 高精度地形采样（异步，返回Promise）
• pointInPolygon: 射线法判断点是否在多边形内
• Cartographic.fromDegrees: 经纬度转地理坐标（弧度）
• 网格面积近似: cellArea = (Δlon×111320×cos(lat)) × (Δlat×110540)
• 土方量公式: volume = |原地形高程 - 设计高程| × 网格面积`,
  clear: () => `【原理】清除 = 批量移除实体 + 重置数据：
1. 遍历 gridEntities，逐个移除网格点实体
2. 移除设计范围实体 designPolygon
3. 重置 currentPositions、earthworkStats 等数据

【要点】清除操作会移除所有设计范围和计算结果，不可撤销。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" type="success" @click="applyDraw">开始绘制</n-button>
      <n-button size="small" type="primary" :loading="calculating" @click="applyCalculate">计算土方</n-button>
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="earthwork-split"
    >
      <template #scene-overlay>
        <div class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white">
          {{ statusText }}
        </div>
      </template>

    <template #bottom-panel>
      <div class="border-t border-gray-200 bg-gray-50 p-4">
        <!-- 参数设置 -->
        <div class="mb-4 flex items-center gap-6">
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-600">设计高程:</span>
            <n-input-number
              v-model:value="designElevation"
              :min="-100"
              :max="5000"
              :step="1"
              size="small"
              style="width: 100px"
            />
            <span class="text-xs text-gray-500">m</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-600">网格密度:</span>
            <n-input-number
              v-model:value="gridDensity"
              :min="5"
              :max="30"
              :step="1"
              size="small"
              style="width: 80px"
            />
            <span class="text-xs text-gray-500">×{{ gridDensity }}</span>
          </div>
        </div>

        <!-- 土方统计 -->
        <div v-if="earthworkStats.gridCount > 0">
          <div class="mb-3 text-sm font-semibold text-gray-700">土方计算结果</div>
          <div class="grid grid-cols-4 gap-3 text-center">
            <div class="rounded-lg bg-red-50 p-3">
              <div class="text-xl font-bold text-red-600">{{ (earthworkStats.cutVolume / 10000).toFixed(2) }}</div>
              <div class="text-xs text-gray-500">挖方量 (万m³)</div>
              <div class="mt-1 text-xs text-red-500">{{ earthworkStats.cutGridCount }} 个网格</div>
            </div>
            <div class="rounded-lg bg-blue-50 p-3">
              <div class="text-xl font-bold text-blue-600">{{ (earthworkStats.fillVolume / 10000).toFixed(2) }}</div>
              <div class="text-xs text-gray-500">填方量 (万m³)</div>
              <div class="mt-1 text-xs text-blue-500">{{ earthworkStats.fillGridCount }} 个网格</div>
            </div>
            <div class="rounded-lg" :class="earthworkStats.balance > 0 ? 'bg-orange-50' : earthworkStats.balance < 0 ? 'bg-purple-50' : 'bg-green-50'">
              <div class="text-xl font-bold" :class="earthworkStats.balance > 0 ? 'text-orange-600' : earthworkStats.balance < 0 ? 'text-purple-600' : 'text-green-600'">
                {{ (Math.abs(earthworkStats.balance) / 10000).toFixed(2) }}
              </div>
              <div class="text-xs text-gray-500">{{ earthworkStats.balance > 0 ? '余方(外运)' : earthworkStats.balance < 0 ? '缺方(取土)' : '挖填平衡' }}</div>
              <div class="mt-1 text-xs text-gray-400">万m³</div>
            </div>
            <div class="rounded-lg bg-gray-100 p-3">
              <div class="text-xl font-bold text-gray-700">{{ earthworkStats.avgOriginalElevation.toFixed(1) }}</div>
              <div class="text-xs text-gray-500">平均原地形 (m)</div>
              <div class="mt-1 text-xs text-gray-400">{{ earthworkStats.gridCount }} 有效网格</div>
            </div>
          </div>
          <div class="mt-3 flex items-center gap-4 text-xs text-gray-500">
            <span class="flex items-center gap-1">
              <span class="inline-block h-3 w-3 rounded-full bg-red-500"></span> 挖方区域
            </span>
            <span class="flex items-center gap-1">
              <span class="inline-block h-3 w-3 rounded-full bg-blue-500"></span> 填方区域
            </span>
            <span>设计高程: {{ designElevation }}m</span>
          </div>
        </div>
        <div v-else class="py-4 text-center text-xs text-gray-400">
          绘制设计范围并设置设计高程后，点击「计算土方」查看结果
        </div>
      </div>
    </template>
    </SplitViewer>
  </div>
</template>
