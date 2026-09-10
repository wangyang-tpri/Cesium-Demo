<script setup lang="ts">
import * as Cesium from "cesium";
import { ref, provide, watch } from "vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";
import SplitViewer from "@/components/base/SplitViewer.vue";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref("analyze");
const statusText = ref("淹没分析：点击「设置区域」在地图上点击，然后调节水位滑块查看淹没范围。");

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-img",
  camera: { position: [108.94, 34.2, 15000], pitch: -55 },
});

const waterLevel = ref(400); // 水位高度（米）
const areaSize = ref(3000); // 区域大小（米，正方形边长）

let centerPos: Cesium.Cartesian3 | null = null;
let centerEntity: Cesium.Entity | null = null;
let areaEntity: Cesium.Entity | null = null;
let floodEntity: Cesium.Entity | null = null;
let waterSurfaceEntity: Cesium.Entity | null = null;
let picking = false;
let handler: Cesium.ScreenSpaceEventHandler | null = null;

function clearAll() {
  const v = viewer.value;
  if (!v) return;
  for (const e of [centerEntity, areaEntity, floodEntity, waterSurfaceEntity]) {
    if (e) v.entities.remove(e);
  }
  centerEntity = areaEntity = floodEntity = waterSurfaceEntity = null;
  centerPos = null;
}

function pickPoint(windowPos: Cesium.Cartesian2): Cesium.Cartesian3 | null {
  const v = viewer.value;
  if (!v) return null;
  const ray = v.camera.getPickRay(windowPos);
  if (!ray) return null;
  return v.scene.globe.pick(ray, v.scene) || null;
}

function startPicking() {
  clearAll();
  picking = true;
  statusText.value = "请在地图上点击设置淹没区域中心...";
  if (!handler) {
    const v = viewer.value!;
    handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
    handler.setInputAction((click: any) => {
      if (!picking) return;
      const pos = pickPoint(click.position);
      if (!pos) return;
      centerPos = pos;
      picking = false;
      // 中心点标记
      centerEntity = v.entities.add({
        position: pos,
        point: { pixelSize: 12, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
        label: { text: "区域中心", font: "13px sans-serif", pixelOffset: new Cesium.Cartesian2(0, -22), fillColor: Cesium.Color.CYAN, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE },
      });
      statusText.value = `区域中心已设置（范围 ${areaSize.value}m x ${areaSize.value}m），调节水位滑块查看淹没范围`;
      updateFlood();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }
}

async function updateFlood() {
  const v = viewer.value;
  if (!v || !centerPos) return;

  const centerCarto = Cesium.Cartographic.fromCartesian(centerPos);
  const halfSize = areaSize.value / 2;
  const GRID = 30; // 网格分辨率（30x30）

  // 生成网格点
  const cartographics: Cesium.Cartographic[] = [];
  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j++) {
      const dx = (j / GRID - 0.5) * halfSize * 2;
      const dy = (i / GRID - 0.5) * halfSize * 2;
      // 近似：经纬度偏移（米转度）
      const lonOffset = dx / (111320 * Math.cos(centerCarto.latitude));
      const latOffset = dy / 110540;
      cartographics.push(Cesium.Cartographic.fromRadians(
        centerCarto.longitude + lonOffset,
        centerCarto.latitude + latOffset,
        0
      ));
    }
  }

  // 采样地形高程
  statusText.value = "正在采样地形高程...";
  const terrainPositions = await Cesium.sampleTerrainMostDetailed(v.terrainProvider, cartographics);

  // 构建淹没区域多边形（低于水位的网格单元）
  const wLevel = waterLevel.value;
  const floodedCells: Cesium.Cartesian3[][] = [];

  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const idx = i * (GRID + 1) + j;
      const h = terrainPositions[idx]?.height ?? 0;
      if (h < wLevel) {
        // 这个网格单元被淹没，构建四边形
        const p1 = terrainPositions[idx];
        const p2 = terrainPositions[idx + 1];
        const p3 = terrainPositions[idx + GRID + 2];
        const p4 = terrainPositions[idx + GRID + 1];
        if (p1 && p2 && p3 && p4) {
          floodedCells.push([
            Cesium.Cartographic.toCartesian(p1),
            Cesium.Cartographic.toCartesian(p2),
            Cesium.Cartographic.toCartesian(p3),
            Cesium.Cartographic.toCartesian(p4),
          ]);
        }
      }
    }
  }

  // 清除旧的淹没区域
  if (floodEntity) v.entities.remove(floodEntity);
  if (waterSurfaceEntity) v.entities.remove(waterSurfaceEntity);
  if (areaEntity) v.entities.remove(areaEntity);

  // 绘制区域边界（白色虚线框）
  const boundaryPositions = [
    terrainPositions[0],
    terrainPositions[GRID],
    terrainPositions[GRID * (GRID + 1) + GRID],
    terrainPositions[GRID * (GRID + 1)],
    terrainPositions[0],
  ].filter(Boolean).map((c) => Cesium.Cartographic.toCartesian(c!));
  areaEntity = v.entities.add({
    polyline: { positions: boundaryPositions, width: 2, material: Cesium.Color.WHITE.withAlpha(0.8), dashPattern: 255 },
  });

  // 绘制淹没区域（蓝色半透明）
  if (floodedCells.length > 0) {
    // 将所有淹没单元合并为一个多边形（带孔）
    const allPositions = floodedCells.flat();
    floodEntity = v.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(allPositions),
        material: Cesium.Color.fromCssColorString("#0fc6c2").withAlpha(0.5),
        outline: false,
      },
    });
  }

  // 绘制水面（区域内统一水位高度的平面）
  const waterPositions = [
    terrainPositions[0],
    terrainPositions[GRID],
    terrainPositions[GRID * (GRID + 1) + GRID],
    terrainPositions[GRID * (GRID + 1)],
  ].filter(Boolean).map((c) => {
    const carto = c!;
    return Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, wLevel);
  });
  waterSurfaceEntity = v.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(waterPositions),
      material: Cesium.Color.fromCssColorString("#409eff").withAlpha(0.3),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString("#409eff"),
      outlineWidth: 1,
    },
  });

  // 统计淹没比例
  const totalCells = GRID * GRID;
  const floodRatio = ((floodedCells.length / totalCells) * 100).toFixed(1);
  statusText.value = `✅ 水位 ${wLevel}m：淹没 ${floodedCells.length}/${totalCells} 网格（${floodRatio}%），青色=淹没区域，蓝色平面=水面`;
}

// 水位变化时实时更新
watch(waterLevel, () => {
  if (centerPos) updateFlood();
});

function applySetArea() {
  activeFeature.value = "analyze";
  startPicking();
}

function applyClear() {
  activeFeature.value = "analyze";
  picking = false;
  clearAll();
  statusText.value = "已清除，点击「设置区域」重新设置。";
}

const codeMap: Record<string, () => string> = {
  analyze: () => `// ① 生成分析区域网格（30x30）
const GRID = 30
for (let i = 0; i <= GRID; i++) {
  for (let j = 0; j <= GRID; j++) {
    const lon = centerLon + (j/GRID - 0.5) * size
    const lat = centerLat + (i/GRID - 0.5) * size
    cartographics.push(Cartographic.fromRadians(lon, lat, 0))
  }
}

// ② 高精度地形采样
const terrain = await sampleTerrainMostDetailed(
  terrainProvider, cartographics)

// ③ 条件判断：地形高度 < 水位 → 被淹没
for (each grid cell) {
  if (terrainHeight < waterLevel) → 标记为淹没单元
}

// ④ 可视化：淹没区域 + 水面
// 淹没区域：青色半透明多边形
viewer.entities.add({ polygon: { hierarchy: floodedCells, material: Color.CYAN.withAlpha(0.5) } })
// 水面：蓝色半透明平面（统一水位高度）
viewer.entities.add({ polygon: { hierarchy: waterPositions, material: Color.BLUE.withAlpha(0.3) } })`,
};

const explainMap: Record<string, () => string> = {
  analyze: () => `【原理】淹没分析 = 地形采样 + 条件着色：
1. 在分析区域内生成 N x N 网格点
2. sampleTerrainMostDetailed 获取每个网格点的地形高程
3. 条件判断：地形高度 < 水位高度 → 该网格单元被淹没
4. 可视化：
   - 青色半透明多边形 = 被淹没的陆地区域
   - 蓝色半透明平面 = 水面（统一水位高度）
   - 白色虚线框 = 分析区域边界
5. 水位滑块实时调节，重新计算淹没范围

【API】
• sampleTerrainMostDetailed：高精度地形采样（异步）
• PolygonHierarchy：多边形层级（合并多个网格单元）
• watch：Vue 响应式监听水位变化，实时更新

【参数】
• 水位高度：水面海拔高度（米）
• 区域大小：分析区域边长（米，正方形）
• 网格分辨率：30x30（越高越精确，越慢）

【要点】这是基于网格的 CPU 淹没分析，适合小范围精确分析；
大范围淹没建议用 GPU 着色器实现（深度缓冲 + 水位 uniform）。
可扩展为：动态水位上升动画、淹没时序回放、淹没面积统计。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button
        size="small"
        :type="activeFeature === 'analyze' ? 'primary' : 'default'"
        @click="applySetArea"
        >设置区域</n-button
      >
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
      <div class="flex items-center gap-2 ml-2">
        <span class="text-xs text-gray-500">水位(m)</span>
        <n-slider
          v-model:value="waterLevel"
          :min="200"
          :max="800"
          :step="10"
          :tooltip="true"
          style="width: 200px"
        />
        <span class="text-sm font-mono font-bold text-blue-500">{{ waterLevel }}m</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500">范围(m)</span>
        <n-input-number v-model:value="areaSize" :min="1000" :max="10000" :step="500" size="small" style="width: 100px" />
      </div>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="flood-split"
    >
      <template #scene-overlay>
        <div
          class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white"
        >
          {{ statusText }}
        </div>
      </template>
    </SplitViewer>
  </div>
</template>
