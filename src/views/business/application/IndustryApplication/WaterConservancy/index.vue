<script setup lang="ts">
import { ref, provide, onBeforeUnmount, watch } from "vue";
import * as Cesium from "cesium";
import SplitViewer from "@/components/base/SplitViewer.vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-img",
  camera: { position: [108.94, 34.2, 20000], pitch: -45 },
});

type WaterAction = "reservoir" | "river" | "flood" | "clear";
const activeFeature = ref<WaterAction>("reservoir");
const statusText = ref(
  "水利监测：点击「水库水位」查看水位监测，拖动滑块模拟水位变化。"
);

interface MonitorStation {
  id: number;
  name: string;
  position: [number, number];
  waterLevel: number;
  warningLevel: number;
  status: "正常" | "预警" | "超警";
}

const monitorStations = ref<MonitorStation[]>([]);
let stationEntities: Cesium.Entity[] = [];
let reservoirEntity: Cesium.Entity | null = null;
let riverEntities: Cesium.Entity[] = [];
let floodEntity: Cesium.Entity | null = null;
let stationIdCounter = 0;

// 水位控制
const waterLevel = ref(50);
const maxWaterLevel = ref(100);
const isFloodSimulating = ref(false);

// 加载水库水位监测
function loadReservoir() {
  const v = viewer.value;
  if (!v) return;
  clearReservoir();
  clearRiver();
  clearFlood();

  // 水库范围（椭圆形）
  reservoirEntity = v.entities.add({
    position: Cesium.Cartesian3.fromDegrees(108.94, 34.2, 0),
    ellipse: {
      semiMinorAxis: 800,
      semiMajorAxis: 1200,
      material: Cesium.Color.CYAN.withAlpha(0.4),
      outline: true,
      outlineColor: Cesium.Color.BLUE,
      height: waterLevel.value,
    },
    label: {
      text: "示范水库",
      font: "14px sans-serif",
      pixelOffset: new Cesium.Cartesian2(0, -30),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    },
  });

  // 监测站点
  const stations = [
    { name: "坝前水位站", pos: [108.935, 34.195], level: 48.5, warning: 60 },
    { name: "入库水文站", pos: [108.95, 34.21], level: 52.3, warning: 65 },
    { name: "出库流量站", pos: [108.93, 34.19], level: 45.8, warning: 55 },
  ];

  stations.forEach((s) => {
    const id = ++stationIdCounter;
    const status =
      s.level >= s.warning
        ? "超警"
        : s.level >= s.warning * 0.85
        ? "预警"
        : "正常";
    const station: MonitorStation = {
      id,
      name: s.name,
      position: s.pos,
      waterLevel: s.level,
      warningLevel: s.warning,
      status,
    };
    monitorStations.value.push(station);

    const color =
      status === "超警"
        ? Cesium.Color.RED
        : status === "预警"
        ? Cesium.Color.ORANGE
        : Cesium.Color.GREEN;
    const entity = v.entities.add({
      position: Cesium.Cartesian3.fromDegrees(s.pos[0], s.pos[1], 10),
      point: {
        pixelSize: 14,
        color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: `${s.name}\n水位: ${s.level}m`,
        font: "11px sans-serif",
        pixelOffset: new Cesium.Cartesian2(0, -22),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      },
    });
    stationEntities.push(entity);
  });

  activeFeature.value = "reservoir";
  statusText.value = `已加载水库水位监测，共 ${monitorStations.value.length} 个监测站点。拖动下方滑块调整水位。`;
  v.flyTo(reservoirEntity, { duration: 1.5 });
}

// 水位变化监听
watch(waterLevel, (val) => {
  if (reservoirEntity && reservoirEntity.ellipse) {
    reservoirEntity.ellipse.height = new Cesium.ConstantProperty(val);
  }
  if (isFloodSimulating.value && floodEntity && floodEntity.polygon) {
    // 洪水淹没范围随水位扩大
    const scale = 1 + (val - 50) / 100;
    updateFloodPolygon(scale);
  }
  statusText.value = `当前水位：${val}m，${
    val >= 80 ? "超警戒水位！" : val >= 60 ? "接近警戒水位" : "正常水位范围"
  }`;
});

// 加载河道断面
function loadRiver() {
  const v = viewer.value;
  if (!v) return;
  clearReservoir();
  clearRiver();
  clearFlood();

  // 模拟河道（折线）
  const riverPoints: [number, number][] = [
    [108.9, 34.25],
    [108.92, 34.23],
    [108.94, 34.21],
    [108.96, 34.19],
    [108.98, 34.17],
    [109.0, 34.15],
  ];
  const positions = riverPoints.map((p) =>
    Cesium.Cartesian3.fromDegrees(p[0], p[1], 5)
  );

  // 河道水面
  riverEntities.push(
    v.entities.add({
      polyline: {
        positions,
        width: 20,
        material: Cesium.Color.CYAN.withAlpha(0.5),
        clampToGround: true,
      },
    })
  );

  // 河道中心线
  riverEntities.push(
    v.entities.add({
      polyline: {
        positions,
        width: 2,
        material: Cesium.Color.BLUE,
        clampToGround: true,
      },
    })
  );

  // 河道断面标记
  for (let i = 1; i < riverPoints.length - 1; i++) {
    const p = riverPoints[i];
    riverEntities.push(
      v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(p[0], p[1], 10),
        point: {
          pixelSize: 8,
          color: Cesium.Color.YELLOW,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
        },
        label: {
          text: `断面${i}`,
          font: "10px sans-serif",
          pixelOffset: new Cesium.Cartesian2(15, 0),
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        },
      })
    );
  }

  activeFeature.value = "river";
  statusText.value = "已加载河道断面显示，黄色点为监测断面位置。";
}

// 洪水淹没模拟
function startFloodSimulation() {
  const v = viewer.value;
  if (!v) return;
  clearReservoir();
  clearRiver();
  clearFlood();
  isFloodSimulating.value = true;

  // 初始淹没区域
  const centerLon = 108.94;
  const centerLat = 34.2;
  const positions: Cesium.Cartesian3[] = [];
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2;
    const r = 1000 + Math.sin(angle * 3) * 200;
    const lon = centerLon + (r * Math.cos(angle)) / 111000;
    const lat = centerLat + (r * Math.sin(angle)) / 111000;
    positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, waterLevel.value));
  }

  floodEntity = v.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(positions),
      material: Cesium.Color.BLUE.withAlpha(0.4),
      outline: true,
      outlineColor: Cesium.Color.DARKBLUE,
      height: waterLevel.value,
    },
  });

  activeFeature.value = "flood";
  statusText.value = "洪水淹没模拟已启动，拖动水位滑块观察淹没范围变化。";
  v.flyTo(floodEntity, { duration: 1.5 });
}

function updateFloodPolygon(scale: number) {
  if (!floodEntity) return;
  const centerLon = 108.94;
  const centerLat = 34.2;
  const positions: Cesium.Cartesian3[] = [];
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2;
    const r = (1000 + Math.sin(angle * 3) * 200) * scale;
    const lon = centerLon + (r * Math.cos(angle)) / 111000;
    const lat = centerLat + (r * Math.sin(angle)) / 111000;
    positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, waterLevel.value));
  }
  floodEntity.polygon = new Cesium.PolygonGraphics({
    hierarchy: new Cesium.PolygonHierarchy(positions),
    material: Cesium.Color.BLUE.withAlpha(0.4),
    outline: true,
    outlineColor: Cesium.Color.DARKBLUE,
    height: waterLevel.value,
  });
}

function clearReservoir() {
  const v = viewer.value;
  if (v && reservoirEntity) {
    v.entities.remove(reservoirEntity);
    reservoirEntity = null;
  }
  if (v) stationEntities.forEach((e) => v.entities.remove(e));
  stationEntities = [];
  monitorStations.value = [];
}

function clearRiver() {
  const v = viewer.value;
  if (v) riverEntities.forEach((e) => v.entities.remove(e));
  riverEntities = [];
}

function clearFlood() {
  const v = viewer.value;
  if (v && floodEntity) {
    v.entities.remove(floodEntity);
    floodEntity = null;
  }
  isFloodSimulating.value = false;
}

function applyClear() {
  activeFeature.value = "clear";
  clearReservoir();
  clearRiver();
  clearFlood();
  waterLevel.value = 50;
  statusText.value = "已清除所有水利数据，选择功能重新加载。";
}

onBeforeUnmount(() => {
  clearReservoir();
  clearRiver();
  clearFlood();
});

const codeMap: Record<WaterAction, () => string> = {
  reservoir: () => `// 1. 水库水面（椭圆+高度）
const reservoir = viewer.value.entities.add({
  position: Cartesian3.fromDegrees(lon, lat, 0),
  ellipse: {
    semiMinorAxis: 800, semiMajorAxis: 1200,
    material: Color.CYAN.withAlpha(0.4),
    height: waterLevel, // 水位高度
  },
});

// 2. 水位监测站点
const entity = viewer.value.entities.add({
  position: Cartesian3.fromDegrees(lon, lat, 10),
  point: { pixelSize: 14, color: statusColor },
  label: { text: name + '\\n水位: ' + level + 'm' },
});

// 3. 水位状态判断
const status = level >= warning ? '超警'
  : level >= warning * 0.85 ? '预警' : '正常';`,
  river: () => `// 河道断面显示
const riverPoints = [[lon1,lat1],[lon2,lat2],...];
const positions = riverPoints.map(p => Cartesian3.fromDegrees(p[0], p[1], 5));

// 河道水面（宽线）
viewer.value.entities.add({
  polyline: { positions, width: 20, material: Color.CYAN.withAlpha(0.5), clampToGround: true },
});

// 监测断面标记
viewer.value.entities.add({
  position: Cartesian3.fromDegrees(lon, lat, 10),
  point: { pixelSize: 8, color: Color.YELLOW },
  label: { text: '断面' + id },
});`,
  flood: () => `// 洪水淹没模拟
function updateFloodPolygon(scale) {
  const positions = [];
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2;
    const r = baseRadius * scale; // 淹没范围随水位扩大
    positions.push(Cartesian3.fromDegrees(
      centerLon + r * Math.cos(angle) / 111000,
      centerLat + r * Math.sin(angle) / 111000,
      waterLevel
    ));
  }
  floodEntity.polygon = {
    hierarchy: new PolygonHierarchy(positions),
    material: Color.BLUE.withAlpha(0.4),
    height: waterLevel,
  };
}`,
  clear: () => `// 清除所有水利数据
if (reservoirEntity) viewer.value.entities.remove(reservoirEntity);
stationEntities.forEach(e => viewer.value.entities.remove(e));
riverEntities.forEach(e => viewer.value.entities.remove(e));
if (floodEntity) viewer.value.entities.remove(floodEntity);`,
};

const explainMap: Record<WaterAction, () => string> = {
  reservoir: () => `【原理】水库水位监测 = 椭圆水面 + 监测站点 + 状态预警：
1. 使用 Entity.ellipse 绘制水库水面，semiMinor/semiMajor 定义椭圆半径
2. height 属性控制水面高度，模拟水位变化
3. 监测站点使用 point + label 标记位置和实时水位
4. 状态分级：正常(绿)/预警(橙)/超警(红)，基于水位与警戒值比较
5. 实际项目中水位数据来自水位计传感器实时上报

【API】
• Entity.ellipse: 椭圆实体，semiMinorAxis/semiMajorAxis/height
• Entity.point/label: 点和标签实体
• HeightReference.CLAMP_TO_GROUND: 标签贴地显示
• 水位状态: level >= warning → 超警`,
  river: () => `【原理】河道断面显示 = 折线河道 + 断面标记：
1. 使用 Entity.polyline 绘制河道，width=20 模拟水面宽度
2. clampToGround 使河道贴地显示，随地形起伏
3. 黄色点标记监测断面位置，用于水文测验
4. 实际项目中断面数据用于计算流量、流速等水文参数

【API】
• Entity.polyline: 折线实体，positions/width/material/clampToGround
• 河道中心线: 细蓝色折线，水面: 宽半透明青色折线`,
  flood: () => `【原理】洪水淹没模拟 = 动态多边形 + 水位驱动：
1. 使用 Entity.polygon 绘制淹没区域，36个点近似圆形边界
2. 水位上升时，淹没范围按比例扩大（scale = 1 + (level-50)/100）
3. polygon.height 设置淹没水深
4. 半透明蓝色填充，不遮挡底图地理信息
5. 实际项目中淹没范围基于 DEM 地形和水位计算

【API】
• Entity.polygon: 多边形实体，hierarchy/material/height
• PolygonHierarchy: 多边形层次结构
• watch(waterLevel): 监听水位变化，动态更新淹没范围`,
  clear: () => `【原理】清除 = 批量移除实体 + 重置状态：
1. 移除水库、河道、洪水等各类实体
2. 清空监测站点数据
3. 重置水位滑块和模拟状态

【要点】清除操作会移除所有水利数据，不可撤销。`,
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
      <n-button size="small" type="primary" @click="loadReservoir"
        >水库水位</n-button
      >
      <n-button size="small" type="success" @click="loadRiver"
        >河道断面</n-button
      >
      <n-button size="small" type="warning" @click="startFloodSimulation"
        >洪水模拟</n-button
      >
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <!-- 水位控制 -->
    <div
      class="flex items-center gap-4 rounded border border-gray-200 bg-gray-50 px-4 py-2 text-xs"
    >
      <span class="text-gray-600">水位控制:</span>
      <n-slider
        v-model:value="waterLevel"
        :min="0"
        :max="100"
        :step="1"
        style="width: 200px"
      />
      <span
        class="font-medium"
        :class="
          waterLevel >= 80
            ? 'text-red-600'
            : waterLevel >= 60
            ? 'text-orange-600'
            : 'text-blue-600'
        "
        >{{ waterLevel }}m</span
      >
      <span class="text-gray-400">|</span>
      <span class="text-gray-500">警戒水位: 80m</span>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="water-conservancy-split"
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
            <div class="text-sm font-semibold text-gray-700">监测站点</div>
            <div class="flex gap-4 text-xs">
              <span class="text-green-600"
                >● 正常
                {{
                  monitorStations.filter((s) => s.status === "正常").length
                }}</span
              >
              <span class="text-orange-600"
                >● 预警
                {{
                  monitorStations.filter((s) => s.status === "预警").length
                }}</span
              >
              <span class="text-red-600"
                >● 超警
                {{
                  monitorStations.filter((s) => s.status === "超警").length
                }}</span
              >
            </div>
          </div>
          <div
            v-if="monitorStations.length === 0"
            class="py-4 text-center text-xs text-gray-400"
          >
            点击「水库水位」加载监测站点
          </div>
          <div v-else class="grid grid-cols-3 gap-3">
            <div
              v-for="s in monitorStations"
              :key="s.id"
              class="rounded border p-2 text-xs"
              :class="
                s.status === '超警'
                  ? 'border-red-300 bg-red-50'
                  : s.status === '预警'
                  ? 'border-orange-300 bg-orange-50'
                  : 'border-green-300 bg-green-50'
              "
            >
              <div
                class="font-semibold"
                :class="
                  s.status === '超警'
                    ? 'text-red-700'
                    : s.status === '预警'
                    ? 'text-orange-700'
                    : 'text-green-700'
                "
              >
                {{ s.name }}
              </div>
              <div class="mt-1 text-gray-600">
                水位: <b>{{ s.waterLevel }}m</b>
              </div>
              <div class="text-gray-600">警戒: {{ s.warningLevel }}m</div>
              <div class="mt-1">
                <n-tag
                  size="small"
                  :type="
                    s.status === '超警'
                      ? 'error'
                      : s.status === '预警'
                      ? 'warning'
                      : 'success'
                  "
                  >{{ s.status }}</n-tag
                >
              </div>
            </div>
          </div>
        </div>
      </template>
    </SplitViewer>
  </div>
</template>
