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

const activeFeature = ref<'add-point' | 'calculate' | 'undo' | 'clear'>('add-point');
const statusText = ref('路径规划：点击「添加航点」，然后在地图上依次点击添加航点，点击「计算路径」生成规划路径。');

// 航点列表
interface Waypoint {
  id: number;
  position: Cesium.Cartesian3;
  longitude: number;
  latitude: number;
  height: number;
}

const waypoints = ref<Waypoint[]>([]);
let waypointIdCounter = 0;
let picking = false;
let handler: Cesium.ScreenSpaceEventHandler | null = null;
let pathEntity: Cesium.Entity | null = null;
let waypointEntities: Cesium.Entity[] = [];

// 路径统计
const pathStats = ref({
  totalDistance: 0,
  segmentCount: 0,
  estimatedTimeWalk: 0,
  estimatedTimeCar: 0,
});

onBeforeUnmount(() => {
  if (handler) {
    handler.destroy();
    handler = null;
  }
});

function startPicking() {
  clearPath();
  picking = true;
  statusText.value = "请在地图上依次点击添加航点（至少2个），点击「计算路径」完成规划。";
  if (!handler) {
    const v = viewer.value!;
    handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
    handler.setInputAction((click: any) => {
      if (!picking) return;
      const v = viewer.value!;
      const cartesian = v.scene.pickPosition(click.position);
      if (!cartesian) return;
      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      const wp: Waypoint = {
        id: ++waypointIdCounter,
        position: cartesian,
        longitude: Cesium.Math.toDegrees(carto.longitude),
        latitude: Cesium.Math.toDegrees(carto.latitude),
        height: carto.height,
      };
      waypoints.value.push(wp);
      addWaypointEntity(wp);
      statusText.value = `已添加 ${waypoints.value.length} 个航点，继续点击添加或点击「计算路径」。`;
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }
}

function addWaypointEntity(wp: Waypoint) {
  const v = viewer.value!;
  const entity = v.entities.add({
    position: wp.position,
    point: {
      pixelSize: 12,
      color: Cesium.Color.fromCssColorString('#18a058'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
    },
    label: {
      text: `航点${wp.id}`,
      font: '13px sans-serif',
      pixelOffset: new Cesium.Cartesian2(0, -22),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    },
  });
  waypointEntities.push(entity);
}

function calculatePath() {
  if (waypoints.value.length < 2) {
    statusText.value = "至少需要2个航点才能计算路径，请继续添加航点。";
    return;
  }
  picking = false;
  const v = viewer.value!;

  // 清除旧路径
  if (pathEntity) {
    v.entities.remove(pathEntity);
    pathEntity = null;
  }

  // 构建路径坐标
  const positions = waypoints.value.map(wp => wp.position);

  // 添加路径线
  pathEntity = v.entities.add({
    polyline: {
      positions: positions,
      width: 5,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.2,
        color: Cesium.Color.fromCssColorString('#18a058'),
      }),
      clampToGround: true,
    },
  });

  // 计算每段距离和总距离
  let totalDistance = 0;
  for (let i = 0; i < positions.length - 1; i++) {
    const dist = Cesium.Cartesian3.distance(positions[i], positions[i + 1]);
    totalDistance += dist;
  }

  // 预计时间（步行 5km/h，汽车 40km/h）
  const walkSpeed = 5000 / 3600; // m/s
  const carSpeed = 40000 / 3600; // m/s
  pathStats.value = {
    totalDistance: totalDistance,
    segmentCount: positions.length - 1,
    estimatedTimeWalk: totalDistance / walkSpeed,
    estimatedTimeCar: totalDistance / carSpeed,
  };

  statusText.value = `路径规划完成：共 ${pathStats.value.segmentCount} 段，总距离 ${(totalDistance / 1000).toFixed(2)} km，步行约 ${formatTime(pathStats.value.estimatedTimeWalk)}，驾车约 ${formatTime(pathStats.value.estimatedTimeCar)}。`;

  // 飞到路径
  v.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      waypoints.value[0].longitude,
      waypoints.value[0].latitude,
      Math.max(totalDistance * 0.8, 2000)
    ),
    duration: 1.5,
  });
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}小时${m}分钟`;
  return `${m}分钟`;
}

function removeLastWaypoint() {
  if (waypoints.value.length === 0) return;
  waypoints.value.pop();
  const lastEntity = waypointEntities.pop();
  if (lastEntity) {
    viewer.value!.entities.remove(lastEntity);
  }
  statusText.value = `已删除最后一个航点，当前共 ${waypoints.value.length} 个航点。`;
}

function clearPath() {
  const v = viewer.value!;
  if (pathEntity) {
    v.entities.remove(pathEntity);
    pathEntity = null;
  }
  waypointEntities.forEach(e => v.entities.remove(e));
  waypointEntities = [];
  waypoints.value = [];
  waypointIdCounter = 0;
  pathStats.value = { totalDistance: 0, segmentCount: 0, estimatedTimeWalk: 0, estimatedTimeCar: 0 };
}

function applyStart() {
  activeFeature.value = 'add-point';
  startPicking();
}

function applyCalculate() {
  activeFeature.value = 'calculate';
  calculatePath();
}

function applyUndo() {
  activeFeature.value = 'undo';
  removeLastWaypoint();
}

function applyClear() {
  activeFeature.value = 'clear';
  picking = false;
  clearPath();
  statusText.value = "已清除，点击「添加航点」重新规划路径。";
}

const codeMap: Record<'add-point' | 'calculate' | 'undo' | 'clear', () => string> = {
  'add-point': () => `// 1. 点击添加航点
handler.setInputAction((click) => {
  const cartesian = viewer.scene.pickPosition(click.position);
  const carto = Cartographic.fromCartesian(cartesian);
  waypoints.push({
    id: ++idCounter,
    position: cartesian,
    longitude: toDegrees(carto.longitude),
    latitude: toDegrees(carto.latitude),
  });
}, ScreenSpaceEventType.LEFT_CLICK);

// 2. 添加航点实体
viewer.entities.add({
  position: wp.position,
  point: { pixelSize: 12, color: Color.GREEN },
  label: { text: \`航点\${wp.id}\` },
});`,
  'calculate': () => `// 3. 构建路径线
const positions = waypoints.map(wp => wp.position);
viewer.entities.add({
  polyline: {
    positions: positions,
    width: 5,
    material: new PolylineGlowMaterialProperty({
      glowPower: 0.2,
      color: Color.GREEN,
    }),
    clampToGround: true,
  },
});

// 4. 计算总距离
let totalDistance = 0;
for (let i = 0; i < positions.length - 1; i++) {
  totalDistance += Cartesian3.distance(
    positions[i], positions[i + 1]
  );
}

// 5. 预计时间（步行5km/h，驾车40km/h）
const walkTime = totalDistance / (5000/3600);
const carTime = totalDistance / (40000/3600);`,
  'undo': () => `// 撤销最后一个航点
waypoints.pop();
const lastEntity = waypointEntities.pop();
if (lastEntity) {
  viewer.entities.remove(lastEntity);
}`,
  'clear': () => `// 清除所有航点和路径
waypointEntities.forEach(e => viewer.entities.remove(e));
waypointEntities = [];
waypoints = [];
if (pathEntity) {
  viewer.entities.remove(pathEntity);
  pathEntity = null;
}`,
};

const explainMap: Record<'add-point' | 'calculate' | 'undo' | 'clear', () => string> = {
  'add-point': () => `【原理】航点采集 = 屏幕坐标转三维坐标 + 实体标记：
1. 使用 ScreenSpaceEventHandler 监听地图左键点击事件
2. scene.pickPosition 从屏幕坐标获取三维空间坐标（含地形高度）
3. Cartographic.fromCartesian 转换为地理坐标（经纬度弧度）
4. toDegrees 转换为经纬度度数，记录航点信息
5. 添加 point + label 实体，在地图上标记航点位置

【API】
• ScreenSpaceEventHandler: 屏幕空间事件处理器
• scene.pickPosition: 屏幕坐标转三维坐标
• Cartographic.fromCartesian: 笛卡尔坐标转地理坐标
• Entity.point / Entity.label: 点和标签实体`,
  'calculate': () => `【原理】路径计算 = 折线连接 + 距离累加 + 时间换算：
1. 按航点顺序用 Polyline 连接形成规划路径
2. PolylineGlowMaterialProperty 发光线材质增强视觉效果
3. clampToGround 贴地模式，路径沿地形表面绘制
4. Cartesian3.distance 计算每段两点间的欧几里得距离（米）
5. 累加所有段距离得到总路径长度
6. 根据不同交通方式的平均速度，换算预计通行时间

【API】
• Entity.polyline: 折线实体，positions 定义路径点序列
• PolylineGlowMaterialProperty: 发光线材质
• Cartesian3.distance: 两点间距离计算
• clampToGround: 折线贴地模式`,
  'undo': () => `【原理】撤销航点 = 数组弹出 + 实体移除：
1. waypoints.pop() 移除最后一个航点数据
2. waypointEntities.pop() 获取最后一个航点实体
3. viewer.entities.remove() 从场景中移除该实体

【要点】撤销操作只影响最后一个航点，已计算的路径需要重新计算。`,
  'clear': () => `【原理】清除 = 批量移除实体 + 重置数据：
1. 遍历 waypointEntities，逐个移除航点实体
2. 移除路径实体 pathEntity
3. 重置 waypoints、waypointEntities、pathStats 等数据

【要点】清除操作会移除所有航点和路径，不可撤销。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" type="success" @click="applyStart">添加航点</n-button>
      <n-button size="small" type="primary" @click="applyCalculate">计算路径</n-button>
      <n-button size="small" type="warning" @click="applyUndo">撤销航点</n-button>
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="path-planning-split"
    >
      <template #scene-overlay>
        <div class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white">
          {{ statusText }}
        </div>
      </template>

    <template #bottom-panel>
      <div v-if="pathStats.totalDistance > 0" class="border-t border-gray-200 bg-gray-50 p-4">
        <div class="mb-2 text-sm font-semibold text-gray-700">路径统计</div>
        <div class="grid grid-cols-4 gap-4 text-center">
          <div>
            <div class="text-lg font-bold text-green-600">{{ (pathStats.totalDistance / 1000).toFixed(2) }}</div>
            <div class="text-xs text-gray-500">总距离 (km)</div>
          </div>
          <div>
            <div class="text-lg font-bold text-blue-600">{{ pathStats.segmentCount }}</div>
            <div class="text-xs text-gray-500">路径段数</div>
          </div>
          <div>
            <div class="text-lg font-bold text-orange-600">{{ formatTime(pathStats.estimatedTimeWalk) }}</div>
            <div class="text-xs text-gray-500">步行预计 (5km/h)</div>
          </div>
          <div>
            <div class="text-lg font-bold text-red-600">{{ formatTime(pathStats.estimatedTimeCar) }}</div>
            <div class="text-xs text-gray-500">驾车预计 (40km/h)</div>
          </div>
        </div>
        <div class="mt-3 max-h-32 overflow-auto">
          <div class="text-xs text-gray-500">航点列表：</div>
          <div v-for="(wp, idx) in waypoints" :key="wp.id" class="mt-1 flex items-center gap-2 text-xs text-gray-600">
            <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white">{{ idx + 1 }}</span>
            <span>经度: {{ wp.longitude.toFixed(6) }}°</span>
            <span>纬度: {{ wp.latitude.toFixed(6) }}°</span>
            <span>高程: {{ wp.height.toFixed(1) }}m</span>
          </div>
        </div>
      </div>
    </template>
    </SplitViewer>
  </div>
</template>
