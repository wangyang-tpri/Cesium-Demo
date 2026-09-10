<script setup lang="ts">
import { ref, provide, onBeforeUnmount, watch } from 'vue';
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

type LayerAction = 'switch-img' | 'switch-vec' | 'switch-ter' | 'toggle-terrain' | 'adjust-opacity' | 'clear';
const activeFeature = ref<LayerAction>('switch-img');
const statusText = ref('图层切换：选择底图类型，控制地形和图层透明度。');

const TIANDITU_TK = '0535f2c5cd7ce3bca910dec94c28e054';

// 当前底图类型
const currentBaseLayer = ref<'img' | 'vec' | 'ter'>('img');
// 地形是否开启
const terrainEnabled = ref(false);
// 图层透明度
const layerOpacity = ref(1.0);
// 当前图层信息
const layerInfo = ref({
  baseLayer: '天地图影像',
  terrain: '未开启',
  opacity: '100%',
});

const baseLayers = [
  { key: 'img' as const, label: '影像底图', desc: '天地图卫星影像' },
  { key: 'vec' as const, label: '街道底图', desc: '天地图矢量街道' },
  { key: 'ter' as const, label: '地形底图', desc: '天地图地形晕渲' },
];

// 创建天地图影像图层
function createTiandituImgLayer(): Cesium.ImageryLayer {
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: `https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_TK}`,
    subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
    maximumLevel: 18,
  });
  return new Cesium.ImageryLayer(provider);
}

// 创建天地图矢量图层
function createTiandituVecLayer(): Cesium.ImageryLayer {
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: `https://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_TK}`,
    subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
    maximumLevel: 18,
  });
  return new Cesium.ImageryLayer(provider);
}

// 创建天地图地形图层
function createTiandituTerLayer(): Cesium.ImageryLayer {
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: `https://t{s}.tianditu.gov.cn/ter_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ter&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_TK}`,
    subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
    maximumLevel: 14,
  });
  return new Cesium.ImageryLayer(provider);
}

// 切换底图
function switchBaseLayer(type: 'img' | 'vec' | 'ter') {
  currentBaseLayer.value = type;
  activeFeature.value = `switch-${type}` as LayerAction;

  // 移除所有现有图层
  const layers = viewer.imageryLayers;
  while (layers.length > 0) {
    layers.remove(layers.get(0));
  }

  // 添加新底图
  let newLayer: Cesium.ImageryLayer;
  let layerName = '';
  if (type === 'img') {
    newLayer = createTiandituImgLayer();
    layerName = '天地图影像';
  } else if (type === 'vec') {
    newLayer = createTiandituVecLayer();
    layerName = '天地图街道';
  } else {
    newLayer = createTiandituTerLayer();
    layerName = '天地图地形';
  }
  newLayer.alpha = layerOpacity.value;
  layers.add(newLayer);

  layerInfo.value.baseLayer = layerName;
  statusText.value = `已切换为「${layerName}」`;
}

// 切换地形
function toggleTerrain() {
  terrainEnabled.value = !terrainEnabled.value;
  activeFeature.value = 'toggle-terrain';

  if (terrainEnabled.value) {
    // 加载 Cesium World Terrain
    Cesium.createWorldTerrainAsync().then((terrainProvider) => {
      viewer.terrainProvider = terrainProvider;
      layerInfo.value.terrain = '已开启 (Cesium World Terrain)';
      statusText.value = '地形已开启，正在加载高精度地形数据...';
    }).catch(() => {
      terrainEnabled.value = false;
      statusText.value = '地形加载失败，请检查网络连接';
    });
  } else {
    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    layerInfo.value.terrain = '未开启';
    statusText.value = '地形已关闭';
  }
}

// 调整透明度
watch(layerOpacity, (val) => {
  activeFeature.value = 'adjust-opacity';
  const layers = viewer.imageryLayers;
  for (let i = 0; i < layers.length; i++) {
    layers.get(i).alpha = val;
  }
  layerInfo.value.opacity = `${Math.round(val * 100)}%`;
  statusText.value = `图层透明度已调整为 ${Math.round(val * 100)}%`;
});

function applyClear() {
  activeFeature.value = 'clear';
  // 恢复默认设置
  switchBaseLayer('img');
  if (terrainEnabled.value) {
    terrainEnabled.value = false;
    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    layerInfo.value.terrain = '未开启';
  }
  layerOpacity.value = 1.0;
  statusText.value = '已恢复默认设置：影像底图、无地形、透明度100%';
}

onBeforeUnmount(() => {
  // 恢复默认地形
  viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
});

const codeMap: Record<LayerAction, () => string> = {
  'switch-img': () => `// 切换为天地图影像底图
const provider = new UrlTemplateImageryProvider({
  url: \`https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=\${TK}\`,
  subdomains: ['0','1','2','3','4','5','6','7'],
  maximumLevel: 18,
});
// 移除旧图层，添加新图层
while (viewer.imageryLayers.length > 0) {
  viewer.imageryLayers.remove(viewer.imageryLayers.get(0));
}
viewer.imageryLayers.addImageryProvider(provider);`,
  'switch-vec': () => `// 切换为天地图矢量（街道）底图
const provider = new UrlTemplateImageryProvider({
  url: \`https://t{s}.tianditu.gov.cn/vec_w/wmts?...&LAYER=vec&...&tk=\${TK}\`,
  subdomains: ['0','1','2','3','4','5','6','7'],
  maximumLevel: 18,
});
viewer.imageryLayers.removeAll();
viewer.imageryLayers.addImageryProvider(provider);`,
  'switch-ter': () => `// 切换为天地图地形晕渲底图
const provider = new UrlTemplateImageryProvider({
  url: \`https://t{s}.tianditu.gov.cn/ter_w/wmts?...&LAYER=ter&...&tk=\${TK}\`,
  subdomains: ['0','1','2','3','4','5','6','7'],
  maximumLevel: 14,
});
viewer.imageryLayers.removeAll();
viewer.imageryLayers.addImageryProvider(provider);`,
  'toggle-terrain': () => `// 开启地形（Cesium World Terrain）
const terrainProvider = await createWorldTerrainAsync();
viewer.terrainProvider = terrainProvider;

// 关闭地形（恢复椭球体）
viewer.terrainProvider = new EllipsoidTerrainProvider();`,
  'adjust-opacity': () => `// 调整图层透明度
const layers = viewer.imageryLayers;
for (let i = 0; i < layers.length; i++) {
  layers.get(i).alpha = 0.5; // 0.0 完全透明 ~ 1.0 完全不透明
}

// 也可以在创建图层时设置
const layer = new ImageryLayer(provider, { alpha: 0.7 });`,
  'clear': () => `// 恢复默认设置
viewer.imageryLayers.removeAll();
viewer.imageryLayers.addImageryProvider(defaultProvider);
viewer.terrainProvider = new EllipsoidTerrainProvider();
viewer.imageryLayers.get(0).alpha = 1.0;`,
};

const explainMap: Record<LayerAction, () => string> = {
  'switch-img': () => `【原理】底图切换 = 移除旧图层 + 添加新图层：
1. 使用 UrlTemplateImageryProvider 创建天地图 WMTS 影像服务
2. URL 模板中 {x}/{y}/{z} 为瓦片行列号和缩放级别，{s} 为子域名
3. tk 参数为天地图开发者密钥
4. 先移除 imageryLayers 中所有现有图层，再添加新图层
5. LAYER=img 表示影像图层，maximumLevel 控制最大缩放级别

【API】
• UrlTemplateImageryProvider: URL模板影像提供者
• viewer.imageryLayers: 影像图层集合
• imageryLayers.removeAll(): 移除所有图层
• imageryLayers.addImageryProvider(): 添加影像图层`,
  'switch-vec': () => `【原理】矢量底图 = 天地图 vec 图层：
1. LAYER=vec 表示矢量（街道）图层
2. 矢量底图显示道路、地名、行政边界等矢量要素
3. 切换方式与影像底图相同，仅 URL 中 LAYER 参数不同

【API】同影像底图，仅 LAYER=vec`,
  'switch-ter': () => `【原理】地形晕渲底图 = 天地图 ter 图层：
1. LAYER=ter 表示地形晕渲图层
2. 地形晕渲通过光照模拟显示地形起伏
3. maximumLevel=14，地形图层最大缩放级别较低

【API】同影像底图，仅 LAYER=ter`,
  'toggle-terrain': () => `【原理】地形开关 = terrainProvider 切换：
1. createWorldTerrainAsync() 异步加载 Cesium World Terrain 高精度地形
2. viewer.terrainProvider 设置地形提供者
3. EllipsoidTerrainProvider 为默认椭球体地形（无起伏）
4. 开启地形后，scene.pickPosition 可获取含高程的三维坐标
5. 地形加载是异步的，需要等待 Promise 完成

【API】
• createWorldTerrainAsync(): 创建世界地形（异步）
• viewer.terrainProvider: 地形提供者
• EllipsoidTerrainProvider: 椭球体地形（无起伏）`,
  'adjust-opacity': () => `【原理】透明度调整 = ImageryLayer.alpha 属性：
1. 每个 ImageryLayer 都有 alpha 属性控制透明度
2. alpha 范围 0.0（完全透明）~ 1.0（完全不透明）
3. 遍历 imageryLayers，统一设置所有图层的 alpha
4. 也可以在创建图层时通过 options.alpha 设置初始透明度

【API】
• ImageryLayer.alpha: 图层透明度属性
• imageryLayers.get(i): 获取第i个图层`,
  'clear': () => `【原理】恢复默认 = 重置底图、地形、透明度：
1. 移除所有图层，重新添加默认影像底图
2. 恢复地形为 EllipsoidTerrainProvider（无地形）
3. 恢复图层透明度为 1.0（完全不透明）

【要点】恢复默认操作会重置所有图层设置。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button
        v-for="l in baseLayers"
        :key="l.key"
        size="small"
        :type="currentBaseLayer === l.key ? 'primary' : 'default'"
        @click="switchBaseLayer(l.key)"
      >
        {{ l.label }}
      </n-button>
      <n-button
        size="small"
        :type="terrainEnabled ? 'warning' : 'default'"
        @click="toggleTerrain"
      >
        {{ terrainEnabled ? '关闭地形' : '开启地形' }}
      </n-button>
      <n-button size="small" quaternary @click="applyClear">恢复默认</n-button>
    </div>

    <!-- 透明度控制 -->
    <div class="flex items-center gap-4 rounded border border-gray-200 bg-gray-50 px-4 py-2 text-xs">
      <span class="text-gray-600">图层透明度:</span>
      <n-slider v-model:value="layerOpacity" :min="0" :max="1" :step="0.05" style="width: 200px" />
      <span class="font-medium text-blue-600">{{ Math.round(layerOpacity * 100) }}%</span>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="layer-switch-split"
    >
      <template #scene-overlay>
        <div class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white">
          {{ statusText }}
        </div>
      </template>

      <template #bottom-panel>
        <div class="border-t border-gray-200 bg-gray-50 p-4">
          <div class="mb-2 text-sm font-semibold text-gray-700">当前图层信息</div>
          <div class="grid grid-cols-3 gap-4 text-center">
            <div class="rounded bg-white p-3">
              <div class="text-lg font-bold text-blue-600">{{ layerInfo.baseLayer }}</div>
              <div class="text-xs text-gray-500">底图类型</div>
            </div>
            <div class="rounded bg-white p-3">
              <div class="text-lg font-bold" :class="terrainEnabled ? 'text-green-600' : 'text-gray-400'">{{ layerInfo.terrain }}</div>
              <div class="text-xs text-gray-500">地形状态</div>
            </div>
            <div class="rounded bg-white p-3">
              <div class="text-lg font-bold text-orange-600">{{ layerInfo.opacity }}</div>
              <div class="text-xs text-gray-500">图层透明度</div>
            </div>
          </div>
        </div>
      </template>
    </SplitViewer>
  </div>
</template>
