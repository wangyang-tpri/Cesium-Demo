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
  camera: { position: [108.94, 34.2, 20000], pitch: -45 },
});

type EmergencyAction = "disaster" | "rescue" | "resources" | "clear";
const activeFeature = ref<EmergencyAction>("disaster");
const statusText = ref("应急指挥：点击「灾害标注」标记灾害点，查看受灾范围。");

interface DisasterPoint {
  id: number;
  type: "地震" | "洪水" | "火灾" | "滑坡";
  position: [number, number];
  level: "Ⅳ级" | "Ⅲ级" | "Ⅱ级" | "Ⅰ级";
  affectedRadius: number;
  desc: string;
}

interface RescueRoute {
  id: number;
  from: [number, number];
  to: [number, number];
  distance: number;
  estimatedTime: number;
}

interface Resource {
  id: number;
  type: "救援队伍" | "物资仓库" | "医疗点" | "避难所";
  name: string;
  position: [number, number];
  capacity: number;
  status: "待命" | "出动" | "已满";
}

const disasterPoints = ref<DisasterPoint[]>([]);
const rescueRoutes = ref<RescueRoute[]>([]);
const resources = ref<Resource[]>([]);
let disasterEntities: Cesium.Entity[] = [];
let routeEntities: Cesium.Entity[] = [];
let resourceEntities: Cesium.Entity[] = [];
let disasterIdCounter = 0;
let routeIdCounter = 0;
let resourceIdCounter = 0;

// 灾害标注
function markDisasters() {
  const v = viewer.value;
  if (!v) return;
  clearAll();

  const disasters: { type: DisasterPoint['type']; pos: [number, number]; level: DisasterPoint['level']; radius: number; desc: string }[] = [
    {
      type: "地震",
      pos: [108.95, 34.22],
      level: "Ⅱ级",
      radius: 2000,
      desc: "震级5.2，震源深度10km",
    },
    {
      type: "洪水",
      pos: [108.92, 34.18],
      level: "Ⅲ级",
      radius: 1500,
      desc: "河道超警戒水位1.5m",
    },
    {
      type: "火灾",
      pos: [108.97, 34.2],
      level: "Ⅳ级",
      radius: 800,
      desc: "林区火灾，过火面积约5公顷",
    },
  ];

  disasters.forEach((d) => {
    const id = ++disasterIdCounter;
    const disaster: DisasterPoint = {
      id,
      type: d.type,
      position: d.pos,
      level: d.level,
      affectedRadius: d.radius,
      desc: d.desc,
    };
    disasterPoints.value.push(disaster);

    const levelColors: Record<string, Cesium.Color> = {
      Ⅰ级: Cesium.Color.RED,
      Ⅱ级: Cesium.Color.ORANGE,
      Ⅲ级: Cesium.Color.YELLOW,
      Ⅳ级: Cesium.Color.BLUE,
    };
    const color = levelColors[d.level];

    // 受灾范围（圆）
    disasterEntities.push(
      v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(d.pos[0], d.pos[1], 0),
        ellipse: {
          semiMinorAxis: d.radius,
          semiMajorAxis: d.radius,
          material: color.withAlpha(0.3),
          outline: true,
          outlineColor: color,
          outlineWidth: 2,
        },
      })
    );

    // 灾害点标记
    disasterEntities.push(
      v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(d.pos[0], d.pos[1], 50),
        point: {
          pixelSize: 18,
          color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3,
        },
        label: {
          text: `${d.type}\n${d.level}`,
          font: "bold 12px sans-serif",
          pixelOffset: new Cesium.Cartesian2(0, -28),
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        },
      })
    );
  });

  activeFeature.value = "disaster";
  statusText.value = `已标记 ${disasterPoints.value.length} 个灾害点，红色=Ⅰ级，橙色=Ⅱ级，黄色=Ⅲ级，蓝色=Ⅳ级。`;
  v.flyTo(disasterEntities, { duration: 2 });
}

// 救援路径规划
function planRescueRoutes() {
  const v = viewer.value;
  if (!v) return;
  if (disasterPoints.value.length === 0) markDisasters();
  clearRoutes();

  // 救援中心
  const rescueCenter: [number, number] = [108.9, 34.25];

  // 救援中心标记
  routeEntities.push(
    v.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        rescueCenter[0],
        rescueCenter[1],
        30
      ),
      point: {
        pixelSize: 20,
        color: Cesium.Color.GREEN,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
      },
      label: {
        text: "应急指挥中心",
        font: "bold 12px sans-serif",
        pixelOffset: new Cesium.Cartesian2(0, -28),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      },
    })
  );

  // 为每个灾害点规划救援路径
  disasterPoints.value.forEach((d) => {
    const id = ++routeIdCounter;
    const p1 = Cesium.Cartesian3.fromDegrees(
      rescueCenter[0],
      rescueCenter[1],
      100
    );
    const p2 = Cesium.Cartesian3.fromDegrees(d.position[0], d.position[1], 100);
    const distance = Cesium.Cartesian3.distance(p1, p2);
    const estimatedTime = (distance / 15000) * 60; // 假设平均速度15m/s

    const route: RescueRoute = {
      id,
      from: rescueCenter,
      to: d.position,
      distance,
      estimatedTime,
    };
    rescueRoutes.value.push(route);

    // 路径线
    routeEntities.push(
      v.entities.add({
        polyline: {
          positions: [p1, p2],
          width: 4,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: Cesium.Color.GREEN,
          }),
        },
      })
    );

    // 路径信息标签（中点）
    const midLon = (rescueCenter[0] + d.position[0]) / 2;
    const midLat = (rescueCenter[1] + d.position[1]) / 2;
    routeEntities.push(
      v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(midLon, midLat, 150),
        label: {
          text: `${(distance / 1000).toFixed(1)}km\n约${estimatedTime.toFixed(
            0
          )}分钟`,
          font: "10px sans-serif",
          fillColor: Cesium.Color.WHITE,
          backgroundColor: Cesium.Color.GREEN.withAlpha(0.8),
          showBackground: true,
          backgroundPadding: new Cesium.Cartesian2(6, 4),
        },
      })
    );
  });

  activeFeature.value = "rescue";
  statusText.value = `已规划 ${rescueRoutes.value.length} 条救援路径，绿色发光线为救援通道。`;
}

// 资源分布
function showResources() {
  const v = viewer.value;
  if (!v) return;
  if (disasterPoints.value.length === 0) markDisasters();
  clearResources();

  const resourceData: { type: Resource['type']; name: string; pos: [number, number]; capacity: number; status: Resource['status'] }[] = [
    {
      type: "救援队伍",
      name: "消防救援一中队",
      pos: [108.91, 34.24],
      capacity: 50,
      status: "出动",
    },
    {
      type: "救援队伍",
      name: "武警应急分队",
      pos: [108.93, 34.26],
      capacity: 80,
      status: "待命",
    },
    {
      type: "物资仓库",
      name: "市级应急物资库",
      pos: [108.89, 34.22],
      capacity: 500,
      status: "待命",
    },
    {
      type: "医疗点",
      name: "中心医院急救站",
      pos: [108.94, 34.23],
      capacity: 30,
      status: "出动",
    },
    {
      type: "避难所",
      name: "市体育中心避难所",
      pos: [108.96, 34.21],
      capacity: 2000,
      status: "已满",
    },
    {
      type: "避难所",
      name: "第一中学避难所",
      pos: [108.92, 34.19],
      capacity: 1500,
      status: "待命",
    },
  ];

  const typeColors: Record<string, string> = {
    救援队伍: "#FF6B6B",
    物资仓库: "#4ECDC4",
    医疗点: "#45B7D1",
    避难所: "#96CEB4",
  };

  resourceData.forEach((r) => {
    const id = ++resourceIdCounter;
    const resource: Resource = { id, ...r };
    resources.value.push(resource);

    const color = Cesium.Color.fromCssColorString(typeColors[r.type]);
    const statusColor =
      r.status === "已满"
        ? Cesium.Color.RED
        : r.status === "出动"
        ? Cesium.Color.ORANGE
        : Cesium.Color.GREEN;

    resourceEntities.push(
      v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(r.pos[0], r.pos[1], 30),
        point: {
          pixelSize: 14,
          color,
          outlineColor: statusColor,
          outlineWidth: 3,
        },
        label: {
          text: `${r.name}\n${r.type} | ${r.status}`,
          font: "10px sans-serif",
          pixelOffset: new Cesium.Cartesian2(0, -22),
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        },
      })
    );
  });

  activeFeature.value = "resources";
  statusText.value = `已显示 ${resources.value.length} 个应急资源点，边框颜色：绿=待命，橙=出动，红=已满。`;
}

function clearRoutes() {
  const v = viewer.value;
  if (v) routeEntities.forEach((e) => v.entities.remove(e));
  routeEntities = [];
  rescueRoutes.value = [];
}

function clearResources() {
  const v = viewer.value;
  if (v) resourceEntities.forEach((e) => v.entities.remove(e));
  resourceEntities = [];
  resources.value = [];
}

function clearAll() {
  const v = viewer.value;
  if (v) disasterEntities.forEach((e) => v.entities.remove(e));
  disasterEntities = [];
  disasterPoints.value = [];
  clearRoutes();
  clearResources();
}

function applyClear() {
  activeFeature.value = "clear";
  clearAll();
  statusText.value = "已清除所有应急数据，选择功能重新加载。";
}

onBeforeUnmount(() => {
  clearAll();
});

const codeMap: Record<EmergencyAction, () => string> = {
  disaster: () => `// 1. 受灾范围（椭圆）
viewer.value.entities.add({
  position: Cartesian3.fromDegrees(lon, lat, 0),
  ellipse: {
    semiMinorAxis: radius, semiMajorAxis: radius,
    material: levelColor.withAlpha(0.3),
    outline: true, outlineColor: levelColor,
  },
});

// 2. 灾害点标记
viewer.value.entities.add({
  position: Cartesian3.fromDegrees(lon, lat, 50),
  point: { pixelSize: 18, color: levelColor, outlineColor: Color.WHITE, outlineWidth: 3 },
  label: { text: type + '\\n' + level, font: 'bold 12px sans-serif' },
});

// 3. 响应等级颜色
const levelColors = {
  'Ⅰ级': Color.RED,    // 特别重大
  'Ⅱ级': Color.ORANGE, // 重大
  'Ⅲ级': Color.YELLOW, // 较大
  'Ⅳ级': Color.BLUE,   // 一般
};`,
  rescue: () => `// 救援路径规划
const p1 = Cartesian3.fromDegrees(centerLon, centerLat, 100);
const p2 = Cartesian3.fromDegrees(disasterLon, disasterLat, 100);

// 发光路径线
viewer.value.entities.add({
  polyline: {
    positions: [p1, p2],
    width: 4,
    material: new PolylineGlowMaterialProperty({
      glowPower: 0.2, color: Color.GREEN,
    }),
  },
});

// 距离和时间计算
const distance = Cartesian3.distance(p1, p2);
const estimatedTime = distance / speed * 60; // 分钟`,
  resources: () => `// 应急资源分布
const typeColors = {
  '救援队伍': '#FF6B6B', '物资仓库': '#4ECDC4',
  '医疗点': '#45B7D1', '避难所': '#96CEB4',
};
const statusColors = { '待命': Color.GREEN, '出动': Color.ORANGE, '已满': Color.RED };

viewer.value.entities.add({
  position: Cartesian3.fromDegrees(lon, lat, 30),
  point: {
    pixelSize: 14,
    color: Color.fromCssColorString(typeColors[type]),
    outlineColor: statusColors[status], // 边框颜色表示状态
    outlineWidth: 3,
  },
  label: { text: name + '\\n' + type + ' | ' + status },
});`,
  clear: () => `// 清除所有应急数据
disasterEntities.forEach(e => viewer.value.entities.remove(e));
routeEntities.forEach(e => viewer.value.entities.remove(e));
resourceEntities.forEach(e => viewer.value.entities.remove(e));`,
};

const explainMap: Record<EmergencyAction, () => string> = {
  disaster: () => `【原理】灾害标注 = 受灾范围椭圆 + 等级颜色编码：
1. 使用 Entity.ellipse 绘制受灾范围，semiMinor=semiMajor=半径
2. 响应等级分级：Ⅰ级(红)/Ⅱ级(橙)/Ⅲ级(黄)/Ⅳ级(蓝)，对应特别重大/重大/较大/一般
3. Entity.point 标记灾害点位置，Entity.label 显示灾害类型和等级
4. 半透明填充不遮挡底图，边框清晰标识范围边界
5. 实际项目中灾害数据来自地震局、气象局、消防等部门实时上报

【API】
• Entity.ellipse: 椭圆实体，semiMinorAxis/semiMajorAxis/material
• Entity.point/label: 点和标签实体
• 响应等级: Ⅰ-Ⅳ级颜色编码体系`,
  rescue: () => `【原理】救援路径规划 = 两点连线 + 距离时间计算：
1. 从应急指挥中心到各灾害点绘制救援路径
2. 使用 PolylineGlowMaterialProperty 发光材质，增强路径视觉效果
3. Cartesian3.distance 计算两点间空间距离
4. 根据平均速度估算到达时间（距离/速度）
5. 路径中点显示距离和预计时间标签
6. 实际项目中路径需结合路网数据进行真实路径规划

【API】
• Entity.polyline: 折线实体，positions/width/material
• PolylineGlowMaterialProperty: 发光线材质，glowPower/color
• Cartesian3.distance: 两点间距离计算`,
  resources: () => `【原理】资源分布 = 类型颜色 + 状态边框双编码：
1. 应急资源包括救援队伍、物资仓库、医疗点、避难所等
2. 点的填充颜色表示资源类型，便于快速识别
3. 点的边框颜色表示状态：待命(绿)/出动(橙)/已满(红)
4. Entity.label 显示资源名称、类型和状态
5. 实际项目中资源状态来自应急指挥平台实时数据

【API】
• Entity.point: 点实体，color(填充)/outlineColor(边框)/outlineWidth
• 双编码: 填充色=类型，边框色=状态
• Color.fromCssColorString: CSS颜色字符串转Cesium颜色`,
  clear: () => `【原理】清除 = 批量移除各类实体：
1. 移除灾害点、受灾范围、救援路径、资源点等各类实体
2. 重置数据数组和计数器

【要点】清除操作会移除所有应急数据，不可撤销。`,
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
      <n-button size="small" type="error" @click="markDisasters"
        >灾害标注</n-button
      >
      <n-button size="small" type="success" @click="planRescueRoutes"
        >救援路径</n-button
      >
      <n-button size="small" type="primary" @click="showResources"
        >资源分布</n-button
      >
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="emergency-command-split"
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
          <div class="grid grid-cols-3 gap-4">
            <!-- 灾害点列表 -->
            <div class="rounded border border-gray-200 bg-white p-3">
              <div class="mb-2 text-sm font-semibold text-gray-700">
                灾害点 ({{ disasterPoints.length }})
              </div>
              <div
                v-if="disasterPoints.length === 0"
                class="py-2 text-center text-xs text-gray-400"
              >
                暂无数据
              </div>
              <div v-else class="space-y-1.5">
                <div
                  v-for="d in disasterPoints"
                  :key="d.id"
                  class="flex items-center gap-2 text-xs"
                >
                  <span
                    class="inline-block h-3 w-3 rounded-full"
                    :style="{
                      background:
                        d.level === 'Ⅰ级'
                          ? '#ef4444'
                          : d.level === 'Ⅱ级'
                          ? '#f97316'
                          : d.level === 'Ⅲ级'
                          ? '#eab308'
                          : '#3b82f6',
                    }"
                  ></span>
                  <span class="font-medium">{{ d.type }}</span>
                  <n-tag
                    size="tiny"
                    :type="
                      d.level === 'Ⅰ级'
                        ? 'error'
                        : d.level === 'Ⅱ级'
                        ? 'warning'
                        : d.level === 'Ⅲ级'
                        ? 'warning'
                        : 'info'
                    "
                    >{{ d.level }}</n-tag
                  >
                </div>
              </div>
            </div>
            <!-- 救援路径 -->
            <div class="rounded border border-gray-200 bg-white p-3">
              <div class="mb-2 text-sm font-semibold text-gray-700">
                救援路径 ({{ rescueRoutes.length }})
              </div>
              <div
                v-if="rescueRoutes.length === 0"
                class="py-2 text-center text-xs text-gray-400"
              >
                暂无数据
              </div>
              <div v-else class="space-y-1.5">
                <div v-for="r in rescueRoutes" :key="r.id" class="text-xs">
                  <div class="font-medium text-green-600">路径 #{{ r.id }}</div>
                  <div class="text-gray-500">
                    距离: {{ (r.distance / 1000).toFixed(1) }}km | 约{{
                      r.estimatedTime.toFixed(0)
                    }}分钟
                  </div>
                </div>
              </div>
            </div>
            <!-- 资源统计 -->
            <div class="rounded border border-gray-200 bg-white p-3">
              <div class="mb-2 text-sm font-semibold text-gray-700">
                应急资源 ({{ resources.length }})
              </div>
              <div
                v-if="resources.length === 0"
                class="py-2 text-center text-xs text-gray-400"
              >
                暂无数据
              </div>
              <div v-else class="grid grid-cols-2 gap-2 text-xs">
                <div class="text-center">
                  <div class="text-lg font-bold text-red-500">
                    {{ resources.filter((r) => r.type === "救援队伍").length }}
                  </div>
                  <div class="text-gray-500">救援队伍</div>
                </div>
                <div class="text-center">
                  <div class="text-lg font-bold text-teal-500">
                    {{ resources.filter((r) => r.type === "物资仓库").length }}
                  </div>
                  <div class="text-gray-500">物资仓库</div>
                </div>
                <div class="text-center">
                  <div class="text-lg font-bold text-sky-500">
                    {{ resources.filter((r) => r.type === "医疗点").length }}
                  </div>
                  <div class="text-gray-500">医疗点</div>
                </div>
                <div class="text-center">
                  <div class="text-lg font-bold text-green-500">
                    {{ resources.filter((r) => r.type === "避难所").length }}
                  </div>
                  <div class="text-gray-500">避难所</div>
                </div>
              </div>
              <div class="mt-2 text-xs text-gray-500">
                总容量:
                {{
                  resources.reduce((s, r) => s + r.capacity, 0).toLocaleString()
                }}
                人
              </div>
            </div>
          </div>
        </div>
      </template>
    </SplitViewer>
  </div>
</template>
