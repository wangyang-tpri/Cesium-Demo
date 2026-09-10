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

const activeFeature = ref<'pick' | 'clear'>('pick');
const statusText = ref('坐标拾取：点击「开始拾取」，在地图上点击任意位置获取坐标信息。');

interface PickRecord {
  id: number;
  longitude: number;
  latitude: number;
  height: number;
  screenX: number;
  screenY: number;
  cartesian: Cesium.Cartesian3;
}

const pickRecords = ref<PickRecord[]>([]);
let pickIdCounter = 0;
let picking = false;
let handler: Cesium.ScreenSpaceEventHandler | null = null;
let markerEntities: Cesium.Entity[] = [];

function applyPick() {
  activeFeature.value = 'pick';
  if (picking) {
    stopPicking();
    statusText.value = '已停止拾取，点击「开始拾取」重新开始。';
    return;
  }
  startPicking();
  statusText.value = '拾取模式已开启，点击地图任意位置获取坐标。';
}

function startPicking() {
  picking = true;
  if (!handler) handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((click: any) => {
    const cartesian = viewer.scene.pickPosition(click.position);
    if (!cartesian) return;
    const carto = Cesium.Cartographic.fromCartesian(cartesian);
    const record: PickRecord = {
      id: ++pickIdCounter,
      longitude: Cesium.Math.toDegrees(carto.longitude),
      latitude: Cesium.Math.toDegrees(carto.latitude),
      height: carto.height,
      screenX: click.position.x,
      screenY: click.position.y,
      cartesian,
    };
    pickRecords.value.unshift(record);
    // 添加标记点
    const entity = viewer.entities.add({
      position: cartesian,
      point: { pixelSize: 10, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
      label: {
        text: `#${record.id}`,
        font: '12px sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -18),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      },
    });
    markerEntities.push(entity);
    statusText.value = `已拾取 #${record.id}：经度 ${record.longitude.toFixed(6)}°, 纬度 ${record.latitude.toFixed(6)}°, 高程 ${record.height.toFixed(2)}m`;
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function stopPicking() {
  picking = false;
  if (handler) {
    handler.destroy();
    handler = null;
  }
}

function applyClear() {
  activeFeature.value = 'clear';
  stopPicking();
  pickRecords.value = [];
  pickIdCounter = 0;
  markerEntities.forEach(e => viewer.entities.remove(e));
  markerEntities = [];
  statusText.value = '已清除所有拾取记录，点击「开始拾取」重新开始。';
}

function copyRecord(record: PickRecord) {
  const text = `${record.longitude.toFixed(6)}, ${record.latitude.toFixed(6)}, ${record.height.toFixed(2)}`;
  navigator.clipboard.writeText(text).then(() => {
    statusText.value = `已复制 #${record.id} 坐标到剪贴板：${text}`;
  });
}

function flyToRecord(record: PickRecord) {
  viewer.flyTo(record.cartesian ? { position: record.cartesian } as any : undefined, {
    duration: 1.5,
    offset: new Cesium.HeadingPitchRange(0, -Cesium.Math.PI_OVER_TWO, 500),
  });
}

onBeforeUnmount(() => {
  stopPicking();
  markerEntities.forEach(e => viewer.entities.remove(e));
});

const codeMap: Record<'pick' | 'clear', () => string> = {
  pick: () => `// 1. 创建屏幕空间事件处理器
const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

// 2. 监听左键点击事件
handler.setInputAction((click) => {
  // 3. 从屏幕坐标获取三维空间坐标
  const cartesian = viewer.scene.pickPosition(click.position);
  if (!cartesian) return;

  // 4. 笛卡尔坐标转地理坐标（经纬度弧度）
  const carto = Cartographic.fromCartesian(cartesian);
  const longitude = Math.toDegrees(carto.longitude);
  const latitude = Math.toDegrees(carto.latitude);
  const height = carto.height;

  // 5. 添加标记点实体
  viewer.entities.add({
    position: cartesian,
    point: { pixelSize: 10, color: Color.RED },
    label: { text: '#' + id, pixelOffset: new Cartesian2(0, -18) },
  });
}, ScreenSpaceEventType.LEFT_CLICK);`,
  clear: () => `// 清除所有拾取记录和标记
pickRecords = [];
markerEntities.forEach(e => viewer.entities.remove(e));
markerEntities = [];
if (handler) { handler.destroy(); handler = null; }`,
};

const explainMap: Record<'pick' | 'clear', () => string> = {
  pick: () => `【原理】坐标拾取 = 屏幕事件 + 三维坐标转换 + 地理坐标提取：
1. 使用 ScreenSpaceEventHandler 监听地图左键点击事件
2. scene.pickPosition 从屏幕像素坐标获取三维笛卡尔坐标（含地形高程）
3. Cartographic.fromCartesian 将笛卡尔坐标转换为地理坐标（经纬度弧度+高程）
4. Math.toDegrees 将弧度转换为度数
5. 添加 point + label 实体标记拾取位置
6. 记录屏幕坐标(x,y)、地理坐标(经纬度)、高程、笛卡尔坐标

【API】
• ScreenSpaceEventHandler: 屏幕空间事件处理器
• scene.pickPosition: 屏幕坐标转三维坐标（含地形）
• Cartographic.fromCartesian: 笛卡尔转地理坐标
• Math.toDegrees: 弧度转角度
• Entity.point/label: 点和标签实体`,
  clear: () => `【原理】清除 = 批量移除实体 + 重置数据 + 销毁事件处理器：
1. 遍历 markerEntities，逐个移除标记点实体
2. 重置 pickRecords、pickIdCounter 等数据
3. 销毁 ScreenSpaceEventHandler，停止事件监听

【要点】清除操作会移除所有标记和记录，不可撤销。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" :type="picking ? 'warning' : 'success'" @click="applyPick">
        {{ picking ? '停止拾取' : '开始拾取' }}
      </n-button>
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="coordinate-pick-split"
    >
      <template #scene-overlay>
        <div class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white">
          {{ statusText }}
        </div>
      </template>

      <template #bottom-panel>
        <div class="border-t border-gray-200 bg-gray-50 p-4">
          <div class="mb-2 flex items-center justify-between">
            <div class="text-sm font-semibold text-gray-700">拾取记录</div>
            <div class="text-xs text-gray-500">共 <b class="text-blue-600">{{ pickRecords.length }}</b> 条</div>
          </div>
          <div v-if="pickRecords.length === 0" class="py-4 text-center text-xs text-gray-400">
            点击「开始拾取」后在地图上点击获取坐标
          </div>
          <div v-else class="max-h-48 overflow-auto">
            <table class="w-full text-xs">
              <thead class="sticky top-0 bg-gray-100">
                <tr class="text-left text-gray-600">
                  <th class="px-2 py-1">#</th>
                  <th class="px-2 py-1">经度</th>
                  <th class="px-2 py-1">纬度</th>
                  <th class="px-2 py-1">高程(m)</th>
                  <th class="px-2 py-1">屏幕坐标</th>
                  <th class="px-2 py-1">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in pickRecords" :key="r.id" class="border-t border-gray-200 hover:bg-gray-100">
                  <td class="px-2 py-1 font-medium text-red-600">{{ r.id }}</td>
                  <td class="px-2 py-1">{{ r.longitude.toFixed(6) }}°</td>
                  <td class="px-2 py-1">{{ r.latitude.toFixed(6) }}°</td>
                  <td class="px-2 py-1">{{ r.height.toFixed(2) }}</td>
                  <td class="px-2 py-1 text-gray-500">({{ r.screenX.toFixed(0) }}, {{ r.screenY.toFixed(0) }})</td>
                  <td class="px-2 py-1">
                    <n-button size="tiny" quaternary @click="copyRecord(r)">复制</n-button>
                    <n-button size="tiny" type="primary" quaternary @click="flyToRecord(r)">定位</n-button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </SplitViewer>
  </div>
</template>
