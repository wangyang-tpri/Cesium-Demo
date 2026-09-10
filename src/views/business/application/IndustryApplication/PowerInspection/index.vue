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
  camera: { position: [108.94, 34.2, 15000], pitch: -45 },
});

type PowerAction = 'transmission' | 'corridor' | 'fault' | 'clear';
const activeFeature = ref<PowerAction>('transmission');
const statusText = ref('电力巡检：点击「输电线路」加载杆塔和导线，点击杆塔查看详情。');

interface Tower {
  id: number;
  name: string;
  position: [number, number];
  height: number;
  type: '直线塔' | '耐张塔' | '转角塔';
  status: '正常' | '巡检中' | '故障';
}

interface FaultPoint {
  id: number;
  type: '树障' | '异物' | '绝缘子破损' | '导线断股';
  position: [number, number];
  level: '一般' | '严重' | '紧急';
  desc: string;
}

const towers = ref<Tower[]>([]);
const faultPoints = ref<FaultPoint[]>([]);
let towerEntities: Cesium.Entity[] = [];
let lineEntities: Cesium.Entity[] = [];
let corridorEntity: Cesium.Entity | null = null;
let faultEntities: Cesium.Entity[] = [];
let towerIdCounter = 0;
let faultIdCounter = 0;
let handler: Cesium.ScreenSpaceEventHandler | null = null;
const selectedTower = ref<Tower | null>(null);

// 加载输电线路
function loadTransmissionLine() {
  clearAll();

  // 杆塔路径（模拟一条输电线路）
  const towerPositions: [number, number][] = [
    [108.90, 34.25], [108.915, 34.235], [108.93, 34.22],
    [108.945, 34.205], [108.96, 34.19], [108.975, 34.175],
    [108.99, 34.16],
  ];
  const towerTypes: Tower['type'][] = ['直线塔', '耐张塔', '直线塔', '转角塔', '直线塔', '耐张塔', '直线塔'];
  const statuses: Tower['status'][] = ['正常', '正常', '巡检中', '正常', '正常', '故障', '正常'];

  towerPositions.forEach((pos, idx) => {
    const id = ++towerIdCounter;
    const height = 25 + Math.random() * 15;
    const tower: Tower = {
      id,
      name: `#${idx + 1}杆塔`,
      position: pos,
      height,
      type: towerTypes[idx],
      status: statuses[idx],
    };
    towers.value.push(tower);

    // 杆塔（圆柱体）
    const color = tower.status === '故障' ? Cesium.Color.RED : tower.status === '巡检中' ? Cesium.Color.ORANGE : Cesium.Color.GRAY;
    towerEntities.push(viewer.entities.add({
      name: tower.name,
      position: Cesium.Cartesian3.fromDegrees(pos[0], pos[1], height / 2),
      cylinder: {
        length: height,
        topRadius: 0.5,
        bottomRadius: 1.5,
        material: color,
        outline: true,
        outlineColor: Cesium.Color.BLACK,
      },
      label: {
        text: tower.name,
        font: '11px sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -30),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.NONE,
      },
      properties: { towerId: id },
    }));
  });

  // 导线（连接相邻杆塔）
  for (let i = 0; i < towerPositions.length - 1; i++) {
    const p1 = Cesium.Cartesian3.fromDegrees(towerPositions[i][0], towerPositions[i][1], towers.value[i].height);
    const p2 = Cesium.Cartesian3.fromDegrees(towerPositions[i + 1][0], towerPositions[i + 1][1], towers.value[i + 1].height);
    // 模拟导线弧垂（中间点降低）
    const midLon = (towerPositions[i][0] + towerPositions[i + 1][0]) / 2;
    const midLat = (towerPositions[i][1] + towerPositions[i + 1][1]) / 2;
    const midHeight = (towers.value[i].height + towers.value[i + 1].height) / 2 - 3;
    const mid = Cesium.Cartesian3.fromDegrees(midLon, midLat, midHeight);

    lineEntities.push(viewer.entities.add({
      polyline: {
        positions: [p1, mid, p2],
        width: 2,
        material: Cesium.Color.SILVER,
        arcType: Cesium.ArcType.NONE,
      },
    }));
  }

  activeFeature.value = 'transmission';
  setupPickHandler();
  statusText.value = `已加载输电线路，共 ${towers.value.length} 基杆塔，${towers.value.filter(t => t.status === '故障').length} 基故障。点击杆塔查看详情。`;
  viewer.flyTo(towerEntities, { duration: 2 });
}

// 走廊安全分析
function showCorridor() {
  if (towers.value.length === 0) loadTransmissionLine();

  if (corridorEntity) viewer.entities.remove(corridorEntity);

  // 线路走廊缓冲区（沿线路的多边形）
  const corridorPositions: Cesium.Cartesian3[] = [];
  const halfWidth = 0.003; // 约300米

  // 左侧边界
  for (let i = 0; i < towers.value.length; i++) {
    corridorPositions.push(Cesium.Cartesian3.fromDegrees(towers.value[i].position[0] - halfWidth, towers.value[i].position[1], 0));
  }
  // 右侧边界（反向）
  for (let i = towers.value.length - 1; i >= 0; i--) {
    corridorPositions.push(Cesium.Cartesian3.fromDegrees(towers.value[i].position[0] + halfWidth, towers.value[i].position[1], 0));
  }

  corridorEntity = viewer.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(corridorPositions),
      material: Cesium.Color.YELLOW.withAlpha(0.2),
      outline: true,
      outlineColor: Cesium.Color.ORANGE,
    },
  });

  activeFeature.value = 'corridor';
  statusText.value = '已显示线路走廊安全区（黄色半透明区域，约300米宽）。走廊内禁止违规建筑和超高树木。';
}

// 故障点标记
function markFaults() {
  if (towers.value.length === 0) loadTransmissionLine();

  clearFaults();

  const faultTypes: FaultPoint['type'][] = ['树障', '异物', '绝缘子破损', '导线断股'];
  const levels: FaultPoint['level'][] = ['一般', '严重', '紧急'];
  const descs = ['树木超高接近导线', '风筝缠绕导线', '绝缘子表面破损', '导线外层断股3股'];

  for (let i = 0; i < 4; i++) {
    const tower = towers.value[Math.floor(Math.random() * towers.value.length)];
    const lon = tower.position[0] + (Math.random() - 0.5) * 0.005;
    const lat = tower.position[1] + (Math.random() - 0.5) * 0.005;
    const id = ++faultIdCounter;
    const fault: FaultPoint = {
      id,
      type: faultTypes[i],
      position: [lon, lat],
      level: levels[i],
      desc: descs[i],
    };
    faultPoints.value.push(fault);

    const color = fault.level === '紧急' ? Cesium.Color.RED : fault.level === '严重' ? Cesium.Color.ORANGE : Cesium.Color.YELLOW;
    faultEntities.push(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 20),
      point: { pixelSize: 16, color, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
      label: {
        text: `${fault.type}\n${fault.level}`,
        font: '10px sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -24),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      },
    }));
  }

  activeFeature.value = 'fault';
  statusText.value = `已标记 ${faultPoints.value.length} 个故障点，红色=紧急，橙色=严重，黄色=一般。`;
}

function setupPickHandler() {
  if (!handler) handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((click: any) => {
    const picked = viewer.scene.pick(click.position);
    if (picked && picked.id && picked.id.properties && picked.id.properties.towerId) {
      const tid = picked.id.properties.towerId.getValue();
      selectedTower.value = towers.value.find(t => t.id === tid) || null;
      if (selectedTower.value) {
        statusText.value = `已选中：${selectedTower.value.name}（${selectedTower.value.type}），状态：${selectedTower.value.status}`;
      }
    } else {
      selectedTower.value = null;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function clearFaults() {
  faultEntities.forEach(e => viewer.entities.remove(e));
  faultEntities = [];
  faultPoints.value = [];
}

function clearAll() {
  towerEntities.forEach(e => viewer.entities.remove(e));
  towerEntities = [];
  lineEntities.forEach(e => viewer.entities.remove(e));
  lineEntities = [];
  if (corridorEntity) { viewer.entities.remove(corridorEntity); corridorEntity = null; }
  clearFaults();
  towers.value = [];
  selectedTower.value = null;
  if (handler) { handler.destroy(); handler = null; }
}

function applyClear() {
  activeFeature.value = 'clear';
  clearAll();
  statusText.value = '已清除所有电力数据，选择功能重新加载。';
}

onBeforeUnmount(() => {
  clearAll();
});

const codeMap: Record<PowerAction, () => string> = {
  transmission: () => `// 1. 杆塔（圆柱体）
const tower = viewer.entities.add({
  position: Cartesian3.fromDegrees(lon, lat, height / 2),
  cylinder: {
    length: height,
    topRadius: 0.5, bottomRadius: 1.5,
    material: statusColor,
  },
  label: { text: '#' + id + '杆塔', pixelOffset: new Cartesian2(0, -30) },
  properties: { towerId: id },
});

// 2. 导线（带弧垂的折线）
const p1 = Cartesian3.fromDegrees(lon1, lat1, h1);
const mid = Cartesian3.fromDegrees(midLon, midLat, midHeight - 3); // 弧垂
const p2 = Cartesian3.fromDegrees(lon2, lat2, h2);
viewer.entities.add({
  polyline: { positions: [p1, mid, p2], width: 2, material: Color.SILVER },
});`,
  corridor: () => `// 线路走廊安全区（缓冲区多边形）
const halfWidth = 0.003; // 约300米
const positions = [];
// 左侧边界
towers.forEach(t => positions.push(Cartesian3.fromDegrees(t.lon - halfWidth, t.lat, 0)));
// 右侧边界（反向）
for (let i = towers.length - 1; i >= 0; i--) {
  positions.push(Cartesian3.fromDegrees(towers[i].lon + halfWidth, towers[i].lat, 0));
}
viewer.entities.add({
  polygon: {
    hierarchy: new PolygonHierarchy(positions),
    material: Color.YELLOW.withAlpha(0.2),
    outline: true, outlineColor: Color.ORANGE,
  },
});`,
  fault: () => `// 故障点标记
const levelColors = { '紧急': Color.RED, '严重': Color.ORANGE, '一般': Color.YELLOW };
viewer.entities.add({
  position: Cartesian3.fromDegrees(lon, lat, 20),
  point: { pixelSize: 16, color: levelColors[level], outlineColor: Color.WHITE, outlineWidth: 2 },
  label: {
    text: faultType + '\\n' + level,
    font: '10px sans-serif',
    pixelOffset: new Cartesian2(0, -24),
    style: LabelStyle.FILL_AND_OUTLINE,
  },
});`,
  clear: () => `// 清除所有电力数据
towerEntities.forEach(e => viewer.entities.remove(e));
lineEntities.forEach(e => viewer.entities.remove(e));
if (corridorEntity) viewer.entities.remove(corridorEntity);
faultEntities.forEach(e => viewer.entities.remove(e));
if (handler) { handler.destroy(); handler = null; }`,
};

const explainMap: Record<PowerAction, () => string> = {
  transmission: () => `【原理】输电线路可视化 = 杆塔圆柱体 + 导线弧垂折线：
1. 杆塔使用 Entity.cylinder 圆柱体模拟，topRadius/bottomRadius 模拟锥形塔身
2. position 设置为塔高一半，使杆塔底部贴地
3. 导线使用 Entity.polyline 折线，三点（两塔+中间弧垂点）模拟导线弧垂
4. arcType=NONE 确保折线不按球面弯曲，保持直线段
5. 杆塔状态颜色编码：正常(灰)/巡检中(橙)/故障(红)
6. scene.pick 拾取杆塔，通过 properties.towerId 查询详情

【API】
• Entity.cylinder: 圆柱体实体，length/topRadius/bottomRadius/material
• Entity.polyline: 折线实体，positions/width/arcType
• ArcType.NONE: 直线段模式，不按球面弯曲
• scene.pick: 场景拾取实体`,
  corridor: () => `【原理】线路走廊安全区 = 沿线路缓冲区多边形：
1. 沿输电线路两侧各扩展一定距离（约300米）形成走廊范围
2. 使用 Entity.polygon 绘制走廊区域，半透明黄色填充
3. 走廊内禁止违规建筑、超高树木等安全隐患
4. 实际项目中走廊范围结合地形和线路等级确定

【API】
• Entity.polygon: 多边形实体，hierarchy/material/outline
• PolygonHierarchy: 多边形层次结构
• 缓冲区: 沿线路中心线两侧扩展固定距离`,
  fault: () => `【原理】故障点标记 = 分级颜色编码 + 类型标签：
1. 故障类型包括树障、异物、绝缘子破损、导线断股等
2. 故障等级分级：一般(黄)/严重(橙)/紧急(红)
3. 使用 Entity.point 标记故障位置，不同等级不同颜色
4. Entity.label 显示故障类型和等级
5. 实际项目中故障数据来自无人机巡检或人工上报

【API】
• Entity.point: 点实体，pixelSize/color/outlineColor
• Entity.label: 标签实体，text/font/pixelOffset
• 颜色分级: value → color 映射函数`,
  clear: () => `【原理】清除 = 批量移除实体 + 销毁事件处理器：
1. 移除杆塔、导线、走廊、故障点等各类实体
2. 重置数据数组和计数器
3. 销毁 ScreenSpaceEventHandler，停止拾取事件

【要点】清除操作会移除所有电力数据，不可撤销。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" type="primary" @click="loadTransmissionLine">输电线路</n-button>
      <n-button size="small" type="success" @click="showCorridor">走廊分析</n-button>
      <n-button size="small" type="warning" @click="markFaults">故障标记</n-button>
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="power-inspection-split"
    >
      <template #scene-overlay>
        <div class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white">
          {{ statusText }}
        </div>
      </template>

      <template #bottom-panel>
        <div class="border-t border-gray-200 bg-gray-50 p-4">
          <div class="grid grid-cols-2 gap-4">
            <!-- 杆塔详情 -->
            <div v-if="selectedTower" class="rounded border border-blue-200 bg-blue-50 p-3">
              <div class="mb-2 text-sm font-semibold text-blue-700">杆塔详情</div>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div><span class="text-gray-500">编号：</span>{{ selectedTower.name }}</div>
                <div><span class="text-gray-500">类型：</span>{{ selectedTower.type }}</div>
                <div><span class="text-gray-500">高度：</span>{{ selectedTower.height.toFixed(0) }}m</div>
                <div><span class="text-gray-500">状态：</span>
                  <n-tag size="small" :type="selectedTower.status === '故障' ? 'error' : selectedTower.status === '巡检中' ? 'warning' : 'success'">{{ selectedTower.status }}</n-tag>
                </div>
              </div>
            </div>
            <!-- 统计信息 -->
            <div class="rounded border border-gray-200 bg-white p-3">
              <div class="mb-2 text-sm font-semibold text-gray-700">线路统计</div>
              <div class="grid grid-cols-4 gap-2 text-center text-xs">
                <div>
                  <div class="text-lg font-bold text-gray-600">{{ towers.length }}</div>
                  <div class="text-gray-500">杆塔总数</div>
                </div>
                <div>
                  <div class="text-lg font-bold text-green-600">{{ towers.filter(t => t.status === '正常').length }}</div>
                  <div class="text-gray-500">正常</div>
                </div>
                <div>
                  <div class="text-lg font-bold text-orange-600">{{ towers.filter(t => t.status === '巡检中').length }}</div>
                  <div class="text-gray-500">巡检中</div>
                </div>
                <div>
                  <div class="text-lg font-bold text-red-600">{{ towers.filter(t => t.status === '故障').length }}</div>
                  <div class="text-gray-500">故障</div>
                </div>
              </div>
              <div v-if="faultPoints.length > 0" class="mt-2 text-xs text-gray-500">
                故障点: {{ faultPoints.length }} 个（紧急{{ faultPoints.filter(f => f.level === '紧急').length }} / 严重{{ faultPoints.filter(f => f.level === '严重').length }} / 一般{{ faultPoints.filter(f => f.level === '一般').length }}）
              </div>
            </div>
          </div>
        </div>
      </template>
    </SplitViewer>
  </div>
</template>
