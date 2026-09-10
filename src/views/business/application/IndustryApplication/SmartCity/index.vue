<script setup lang="ts">
import { ref, provide, onBeforeUnmount } from "vue";
import * as Cesium from "cesium";
import SplitViewer from "@/components/base/SplitViewer.vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-vec",
  camera: { position: [116.397, 39.908, 5000], pitch: -45 },
});

type CityAction = "buildings" | "components" | "heatmap" | "clear";
const activeFeature = ref<CityAction>("buildings");
const statusText = ref(
  "智慧城市：点击「加载建筑」生成城市3D建筑群，点击建筑查看详情。"
);

interface Building {
  id: number;
  name: string;
  position: [number, number];
  height: number;
  floors: number;
  type: string;
}

interface CityComponent {
  id: number;
  type: "路灯" | "井盖" | "监控" | "消防栓";
  position: [number, number];
  status: "正常" | "异常";
}

const buildings = ref<Building[]>([]);
const cityComponents = ref<CityComponent[]>([]);
let buildingEntities: Cesium.Entity[] = [];
let componentEntities: Cesium.Entity[] = [];
let heatmapEntities: Cesium.Entity[] = [];
let buildingIdCounter = 0;
let componentIdCounter = 0;
let handler: Cesium.ScreenSpaceEventHandler | null = null;
let initTimer: ReturnType<typeof setTimeout> | null = null;

const selectedBuilding = ref<Building | null>(null);

// 生成随机建筑群
function generateBuildings() {
  const v = viewer.value;
  if (!v) return;
  clearBuildings();
  const centerLon = 116.397;
  const centerLat = 39.908;
  const types = ["商业楼", "住宅楼", "办公楼", "综合体", "酒店"];

  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const lon = centerLon + (col - 2.5) * 0.003;
      const lat = centerLat + (row - 2.5) * 0.003;
      const height = 20 + Math.random() * 100;
      const id = ++buildingIdCounter;
      const building: Building = {
        id,
        name: `${types[Math.floor(Math.random() * types.length)]}${id}`,
        position: [lon, lat],
        height,
        floors: Math.floor(height / 3),
        type: types[Math.floor(Math.random() * types.length)],
      };
      buildings.value.push(building);

      const entity = v.entities.add({
        name: building.name,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, height / 2),
        box: {
          dimensions: new Cesium.Cartesian3(
            80 + Math.random() * 40,
            80 + Math.random() * 40,
            height
          ),
          material: Cesium.Color.fromHsl(
            0.55 + Math.random() * 0.1,
            0.3,
            0.5 + Math.random() * 0.2
          ),
          outline: true,
          outlineColor: Cesium.Color.WHITE.withAlpha(0.5),
        },
        properties: { buildingId: id },
      });
      buildingEntities.push(entity);
    }
  }

  activeFeature.value = "buildings";
  statusText.value = `已生成 ${buildings.value.length} 栋城市建筑，点击建筑查看详情。`;
  v.flyTo(buildingEntities, { duration: 2 });
}

// 加载城市部件
function loadComponents() {
  const v = viewer.value;
  if (!v) return;
  clearComponents();
  const centerLon = 116.397;
  const centerLat = 39.908;
  const types: CityComponent["type"][] = ["路灯", "井盖", "监控", "消防栓"];
  const colors: Record<string, string> = {
    路灯: "#FFD700",
    井盖: "#808080",
    监控: "#00BFFF",
    消防栓: "#FF4500",
  };

  for (let i = 0; i < 30; i++) {
    const lon = centerLon + (Math.random() - 0.5) * 0.02;
    const lat = centerLat + (Math.random() - 0.5) * 0.02;
    const type = types[Math.floor(Math.random() * types.length)];
    const status = Math.random() > 0.15 ? "正常" : "异常";
    const id = ++componentIdCounter;
    const component: CityComponent = { id, type, position: [lon, lat], status };
    cityComponents.value.push(component);

    const entity = v.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 5),
      point: {
        pixelSize: 12,
        color:
          status === "正常"
            ? Cesium.Color.fromCssColorString(colors[type])
            : Cesium.Color.RED,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: `${type}#${id}`,
        font: "10px sans-serif",
        pixelOffset: new Cesium.Cartesian2(0, -16),
        fillColor: status === "正常" ? Cesium.Color.WHITE : Cesium.Color.RED,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      },
    });
    componentEntities.push(entity);
  }

  activeFeature.value = "components";
  const abnormal = cityComponents.value.filter(
    (c) => c.status === "异常"
  ).length;
  statusText.value = `已加载 ${cityComponents.value.length} 个城市部件，其中 ${abnormal} 个异常（红色标记）。`;
}

// 生成人口热力图
function generateHeatmap() {
  const v = viewer.value;
  if (!v) return;
  clearHeatmap();
  const centerLon = 116.397;
  const centerLat = 39.908;
  const gridSize = 8;
  const cellSize = 0.0025;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const lon = centerLon + (col - gridSize / 2) * cellSize;
      const lat = centerLat + (row - gridSize / 2) * cellSize;
      // 模拟人口密度（中心高，边缘低，加随机扰动）
      const dist = Math.sqrt(
        Math.pow(col - gridSize / 2, 2) + Math.pow(row - gridSize / 2, 2)
      );
      const density =
        Math.max(0, 1 - dist / (gridSize / 1.5)) * (0.7 + Math.random() * 0.3);

      const color =
        density > 0.7
          ? Cesium.Color.RED.withAlpha(0.6)
          : density > 0.5
          ? Cesium.Color.ORANGE.withAlpha(0.6)
          : density > 0.3
          ? Cesium.Color.YELLOW.withAlpha(0.6)
          : Cesium.Color.GREEN.withAlpha(0.6);

      const entity = v.entities.add({
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(
            lon,
            lat,
            lon + cellSize,
            lat + cellSize
          ),
          material: color,
          outline: true,
          outlineColor: Cesium.Color.WHITE.withAlpha(0.3),
        },
      });
      heatmapEntities.push(entity);
    }
  }

  activeFeature.value = "heatmap";
  statusText.value =
    "已生成人口热力图：红色=高密度，橙色=中高密度，黄色=中密度，绿色=低密度。";
}

// 点击建筑拾取
function setupPickHandler() {
  const v = viewer.value;
  if (!v) return;
  if (!handler) handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
  handler.setInputAction((click: any) => {
    const picked = v.scene.pick(click.position);
    if (
      picked &&
      picked.id &&
      picked.id.properties &&
      picked.id.properties.buildingId
    ) {
      const bid = picked.id.properties.buildingId.getValue();
      selectedBuilding.value =
        buildings.value.find((b) => b.id === bid) || null;
      if (selectedBuilding.value) {
        statusText.value = `已选中：${selectedBuilding.value.name}，${
          selectedBuilding.value.floors
        }层，高${selectedBuilding.value.height.toFixed(0)}m`;
      }
    } else {
      selectedBuilding.value = null;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function clearBuildings() {
  const v = viewer.value;
  if (v) buildingEntities.forEach((e) => v.entities.remove(e));
  buildingEntities = [];
  buildings.value = [];
  selectedBuilding.value = null;
}

function clearComponents() {
  const v = viewer.value;
  if (v) componentEntities.forEach((e) => v.entities.remove(e));
  componentEntities = [];
  cityComponents.value = [];
}

function clearHeatmap() {
  const v = viewer.value;
  if (v) heatmapEntities.forEach((e) => v.entities.remove(e));
  heatmapEntities = [];
}

function applyClear() {
  activeFeature.value = "clear";
  clearBuildings();
  clearComponents();
  clearHeatmap();
  if (handler) {
    handler.destroy();
    handler = null;
  }
  statusText.value = "已清除所有城市数据，选择功能重新加载。";
}

onBeforeUnmount(() => {
  if (initTimer) clearTimeout(initTimer);
  if (handler) handler.destroy();
  clearBuildings();
  clearComponents();
  clearHeatmap();
});

// 初始化时自动加载建筑并设置拾取
initTimer = setTimeout(() => {
  generateBuildings();
  setupPickHandler();
}, 500);

const codeMap: Record<CityAction, () => string> = {
  buildings: () => `// 1. 创建3D建筑（Box实体）
const building = viewer.value.entities.add({
  name: '商业楼1号',
  position: Cartesian3.fromDegrees(lon, lat, height / 2),
  box: {
    dimensions: new Cartesian3(100, 100, height),
    material: Color.fromHsl(0.6, 0.3, 0.6),
    outline: true,
    outlineColor: Color.WHITE.withAlpha(0.5),
  },
  properties: { buildingId: id },
});

// 2. 点击拾取建筑信息
handler.setInputAction((click) => {
  const picked = viewer.value.scene.pick(click.position);
  if (picked?.id?.properties?.buildingId) {
    const bid = picked.id.properties.buildingId.getValue();
    const building = buildings.find(b => b.id === bid);
  }
}, ScreenSpaceEventType.LEFT_CLICK);`,
  components: () => `// 城市部件管理（点+标签）
const types = ['路灯', '井盖', '监控', '消防栓'];
const entity = viewer.value.entities.add({
  position: Cartesian3.fromDegrees(lon, lat, 5),
  point: {
    pixelSize: 12,
    color: status === '正常' ? Color.GOLD : Color.RED,
    outlineColor: Color.WHITE, outlineWidth: 2,
  },
  label: {
    text: type + '#' + id,
    font: '10px sans-serif',
    pixelOffset: new Cartesian2(0, -16),
    style: LabelStyle.FILL_AND_OUTLINE,
  },
});`,
  heatmap: () => `// 人口热力图（网格颜色渐变）
for (let row = 0; row < gridSize; row++) {
  for (let col = 0; col < gridSize; col++) {
    // 计算密度值（中心高边缘低）
    const density = 1 - dist / maxDist;
    // 根据密度映射颜色
    const color = density > 0.7 ? Color.RED.withAlpha(0.6)
      : density > 0.5 ? Color.ORANGE.withAlpha(0.6)
      : density > 0.3 ? Color.YELLOW.withAlpha(0.6)
      : Color.GREEN.withAlpha(0.6);

    viewer.value.entities.add({
      rectangle: {
        coordinates: Rectangle.fromDegrees(lon, lat, lon + size, lat + size),
        material: color,
      },
    });
  }
}`,
  clear: () => `// 清除所有城市数据
buildingEntities.forEach(e => viewer.value.entities.remove(e));
componentEntities.forEach(e => viewer.value.entities.remove(e));
heatmapEntities.forEach(e => viewer.value.entities.remove(e));
if (handler) { handler.destroy(); handler = null; }`,
};

const explainMap: Record<CityAction, () => string> = {
  buildings: () => `【原理】智慧城市建筑可视化 = Box实体 + 拾取交互：
1. 使用 Entity.box 创建3D建筑模型，dimensions定义长宽高
2. position 设置为建筑中心点（高度的一半），使建筑底部贴地
3. material 使用 HSL 颜色随机生成不同建筑颜色
4. properties 存储自定义属性（buildingId），用于拾取后查询详情
5. scene.pick 拾取点击位置的实体，通过 properties 获取建筑ID
6. 建筑群按网格排列，模拟城市街区布局

【API】
• Entity.box: 立方体实体，dimensions/material/outline
• Cartesian3.fromDegrees: 经纬度转笛卡尔坐标
• scene.pick: 场景拾取，获取点击位置的实体
• Color.fromHsl: HSL颜色空间创建颜色
• viewer.value.flyTo(entities): 飞行到多个实体的包围视角`,
  components: () => `【原理】城市部件管理 = 点实体 + 标签 + 状态编码：
1. 城市部件包括路灯、井盖、监控、消防栓等基础设施
2. 使用 Entity.point 在地图上标记部件位置，不同类型用不同颜色
3. Entity.label 显示部件类型和编号
4. 状态编码：正常=类型颜色，异常=红色，快速识别故障部件
5. 实际项目中部件数据来自 IoT 传感器实时上报

【API】
• Entity.point: 点实体，pixelSize/color/outlineColor
• Entity.label: 标签实体，text/font/pixelOffset
• LabelStyle.FILL_AND_OUTLINE: 文字填充+描边样式`,
  heatmap: () => `【原理】人口热力图 = 网格划分 + 密度颜色映射：
1. 将城市区域划分为 N×N 网格，每个网格代表一个统计单元
2. 计算每个网格的人口密度值（实际项目来自人口普查/手机信令数据）
3. 密度值映射到颜色：红>橙>黄>绿，直观展示人口分布
4. 使用 Entity.rectangle 绘制每个网格，material 设置半透明颜色
5. 半透明叠加在底图上，不遮挡地理信息

【API】
• Entity.rectangle: 矩形实体，coordinates/material/outline
• Rectangle.fromDegrees: 经纬度构建矩形
• Color.withAlpha: 设置颜色透明度
• 密度颜色映射: value → color 分段函数`,
  clear: () => `【原理】清除 = 批量移除实体 + 销毁事件处理器：
1. 遍历各类型实体数组，逐个移除
2. 重置数据数组和计数器
3. 销毁 ScreenSpaceEventHandler，停止拾取事件

【要点】清除操作会移除所有城市数据，不可撤销。`,
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
      <n-button size="small" type="primary" @click="generateBuildings"
        >加载建筑</n-button
      >
      <n-button size="small" type="success" @click="loadComponents"
        >城市部件</n-button
      >
      <n-button size="small" type="warning" @click="generateHeatmap"
        >人口热力</n-button
      >
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="smart-city-split"
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
          <div class="grid grid-cols-2 gap-4">
            <!-- 建筑详情 -->
            <div
              v-if="selectedBuilding"
              class="rounded border border-blue-200 bg-blue-50 p-3"
            >
              <div class="mb-2 text-sm font-semibold text-blue-700">
                建筑详情
              </div>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span class="text-gray-500">名称：</span
                  >{{ selectedBuilding.name }}
                </div>
                <div>
                  <span class="text-gray-500">类型：</span
                  >{{ selectedBuilding.type }}
                </div>
                <div>
                  <span class="text-gray-500">高度：</span
                  >{{ selectedBuilding.height.toFixed(0) }}m
                </div>
                <div>
                  <span class="text-gray-500">楼层：</span
                  >{{ selectedBuilding.floors }}层
                </div>
                <div class="col-span-2">
                  <span class="text-gray-500">坐标：</span
                  >{{ selectedBuilding.position[0].toFixed(6) }},
                  {{ selectedBuilding.position[1].toFixed(6) }}
                </div>
              </div>
            </div>
            <!-- 统计信息 -->
            <div class="rounded border border-gray-200 bg-white p-3">
              <div class="mb-2 text-sm font-semibold text-gray-700">
                城市数据统计
              </div>
              <div class="grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <div class="text-lg font-bold text-blue-600">
                    {{ buildings.length }}
                  </div>
                  <div class="text-gray-500">建筑数量</div>
                </div>
                <div>
                  <div class="text-lg font-bold text-green-600">
                    {{ cityComponents.length }}
                  </div>
                  <div class="text-gray-500">部件数量</div>
                </div>
                <div>
                  <div class="text-lg font-bold text-red-600">
                    {{
                      cityComponents.filter((c) => c.status === "异常").length
                    }}
                  </div>
                  <div class="text-gray-500">异常部件</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </SplitViewer>
  </div>
</template>
