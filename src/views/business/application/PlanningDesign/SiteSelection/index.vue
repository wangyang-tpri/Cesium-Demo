<script setup lang="ts">
import { ref, computed, provide, onBeforeUnmount, watch } from 'vue';
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

const activeFeature = ref<'add-site' | 'clear'>('add-site');
const statusText = ref('选址分析：点击「添加候选点」，在地图上点击添加候选位置，系统自动计算多因子综合得分。');

// 评价因子
interface Factor {
  key: string;
  name: string;
  weight: number;
  color: string;
}

const factors = ref<Factor[]>([
  { key: 'terrain', name: '地形适宜性', weight: 20, color: '#18a058' },
  { key: 'traffic', name: '交通便利性', weight: 20, color: '#2080f0' },
  { key: 'infra', name: '基础设施', weight: 20, color: '#f0a020' },
  { key: 'environment', name: '环境质量', weight: 20, color: '#0fc6c2' },
  { key: 'population', name: '人口密度', weight: 20, color: '#d03050' },
]);

// 候选点
interface CandidateSite {
  id: number;
  name: string;
  position: Cesium.Cartesian3;
  longitude: number;
  latitude: number;
  scores: Record<string, number>;
  totalScore: number;
  grade: string;
  rank: number;
}

const candidates = ref<CandidateSite[]>([]);
let siteIdCounter = 0;
let picking = false;
let handler: Cesium.ScreenSpaceEventHandler | null = null;
let siteEntities: Cesium.Entity[] = [];

// 权重总和
const totalWeight = computed(() => factors.value.reduce((sum, f) => sum + f.weight, 0));

// 排名后的候选点
const rankedCandidates = computed(() => {
  return [...candidates.value].sort((a, b) => b.totalScore - a.totalScore);
});

onBeforeUnmount(() => {
  if (handler) {
    handler.destroy();
    handler = null;
  }
});

// 监听权重变化，重新计算所有候选点得分
watch(factors, () => {
  recalculateAllScores();
}, { deep: true });

function startPicking() {
  picking = true;
  statusText.value = "请在地图上点击添加候选点，系统将自动生成各因子评价得分。";
  if (!handler) {
    const v = viewer.value!;
    handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
    handler.setInputAction((click: any) => {
      if (!picking) return;
      const v = viewer.value!;
      const cartesian = v.scene.pickPosition(click.position);
      if (!cartesian) return;
      addCandidateSite(cartesian);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }
}

function addCandidateSite(position: Cesium.Cartesian3) {
  const carto = Cesium.Cartographic.fromCartesian(position);
  const lon = Cesium.Math.toDegrees(carto.longitude);
  const lat = Cesium.Math.toDegrees(carto.latitude);

  // 基于经纬度生成模拟的因子得分（确定性伪随机）
  const seed = Math.abs(Math.sin(lon * 12.9898 + lat * 78.233) * 43758.5453);
  const scores: Record<string, number> = {};
  factors.value.forEach((f, idx) => {
    const s = Math.abs(Math.sin(seed * (idx + 1) * 1.7)) * 100;
    scores[f.key] = Math.round(s * 10) / 10;
  });

  const site: CandidateSite = {
    id: ++siteIdCounter,
    name: `候选点${siteIdCounter}`,
    position: position,
    longitude: lon,
    latitude: lat,
    scores: scores,
    totalScore: 0,
    grade: '',
    rank: 0,
  };

  site.totalScore = calculateTotalScore(scores);
  site.grade = getGrade(site.totalScore);

  candidates.value.push(site);
  updateRanks();
  addSiteEntity(site);

  statusText.value = `「${site.name}」添加成功：综合得分 ${site.totalScore.toFixed(1)} 分，等级 ${site.grade}。当前共 ${candidates.value.length} 个候选点。`;
}

function calculateTotalScore(scores: Record<string, number>): number {
  if (totalWeight.value === 0) return 0;
  let weightedSum = 0;
  factors.value.forEach(f => {
    weightedSum += (scores[f.key] || 0) * f.weight;
  });
  return weightedSum / totalWeight.value;
}

function getGrade(score: number): string {
  if (score >= 80) return '优秀';
  if (score >= 60) return '良好';
  if (score >= 40) return '一般';
  return '较差';
}

function getGradeColor(score: number): string {
  if (score >= 80) return '#18a058';
  if (score >= 60) return '#2080f0';
  if (score >= 40) return '#f0a020';
  return '#d03050';
}

function updateRanks() {
  const sorted = [...candidates.value].sort((a, b) => b.totalScore - a.totalScore);
  sorted.forEach((site, idx) => {
    site.rank = idx + 1;
  });
}

function recalculateAllScores() {
  candidates.value.forEach(site => {
    site.totalScore = calculateTotalScore(site.scores);
    site.grade = getGrade(site.totalScore);
  });
  updateRanks();
  // 更新实体颜色
  candidates.value.forEach(site => {
    const entity = siteEntities.find(e => e.id === `site-${site.id}`);
    if (entity && entity.point) {
      entity.point.color = Cesium.Color.fromCssColorString(getGradeColor(site.totalScore));
      if (entity.label) {
        entity.label.text = `${site.name}\n${site.totalScore.toFixed(1)}分`;
      }
    }
  });
}

function addSiteEntity(site: CandidateSite) {
  const v = viewer.value!;
  const color = getGradeColor(site.totalScore);
  const entity = v.entities.add({
    id: `site-${site.id}`,
    position: site.position,
    point: {
      pixelSize: 16,
      color: Cesium.Color.fromCssColorString(color),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 3,
    },
    label: {
      text: `${site.name}\n${site.totalScore.toFixed(1)}分`,
      font: '13px sans-serif',
      pixelOffset: new Cesium.Cartesian2(0, -30),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    },
  });
  siteEntities.push(entity);
}

function removeSite(siteId: number) {
  const v = viewer.value!;
  const idx = candidates.value.findIndex(s => s.id === siteId);
  if (idx >= 0) {
    const siteName = candidates.value[idx].name;
    candidates.value.splice(idx, 1);
    const entityIdx = siteEntities.findIndex(e => e.id === `site-${siteId}`);
    if (entityIdx >= 0) {
      v.entities.remove(siteEntities[entityIdx]);
      siteEntities.splice(entityIdx, 1);
    }
    updateRanks();
    statusText.value = `已删除「${siteName}」，当前共 ${candidates.value.length} 个候选点。`;
  }
}

function flyToSite(siteId: number) {
  const v = viewer.value!;
  const entity = siteEntities.find(e => e.id === `site-${siteId}`);
  if (entity) {
    v.flyTo(entity, {
      offset: new Cesium.HeadingPitchRange(0, -Math.PI / 4, 3000),
    });
  }
}

function clearAll() {
  const v = viewer.value!;
  siteEntities.forEach(e => v.entities.remove(e));
  siteEntities = [];
  candidates.value = [];
  siteIdCounter = 0;
}

function applyAdd() {
  activeFeature.value = 'add-site';
  startPicking();
}

function applyClear() {
  activeFeature.value = 'clear';
  picking = false;
  clearAll();
  statusText.value = "已清除所有候选点，点击「添加候选点」重新开始选址分析。";
}

function resetWeights() {
  factors.value.forEach(f => f.weight = 20);
}

const codeMap: Record<'add-site' | 'clear', () => string> = {
  'add-site': () => `// 1. 点击添加候选点
handler.setInputAction((click) => {
  const cartesian = viewer.scene.pickPosition(click.position);
  addCandidateSite(cartesian);
}, ScreenSpaceEventType.LEFT_CLICK);

// 2. 生成因子得分（基于经纬度的确定性伪随机）
const seed = Math.abs(Math.sin(lon * 12.9898 + lat * 78.233) * 43758.5453);
factors.forEach((f, idx) => {
  scores[f.key] = Math.abs(Math.sin(seed * (idx + 1) * 1.7)) * 100;
});

// 3. 加权综合得分计算
function calculateTotalScore(scores) {
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  let weightedSum = 0;
  factors.forEach(f => {
    weightedSum += scores[f.key] * f.weight;
  });
  return weightedSum / totalWeight;
}

// 4. 等级划分
function getGrade(score) {
  if (score >= 80) return '优秀';   // 绿色
  if (score >= 60) return '良好';   // 蓝色
  if (score >= 40) return '一般';   // 橙色
  return '较差';                      // 红色
}`,
  'clear': () => `// 清除所有候选点
siteEntities.forEach(e => viewer.entities.remove(e));
siteEntities = [];
candidates = [];
siteIdCounter = 0;`,
};

const explainMap: Record<'add-site' | 'clear', () => string> = {
  'add-site': () => `【原理】选址分析 = 多因子评价 + 加权综合 + 等级排名：
1. 用户在地图上点击添加候选点，系统基于经纬度生成各因子模拟得分
2. 评价因子包括：地形适宜性、交通便利性、基础设施、环境质量、人口密度
3. 每个因子设置权重（默认各20%），加权求和得到综合得分
4. 综合得分按等级划分：优秀(≥80)、良好(≥60)、一般(≥40)、较差(<40)
5. 候选点按综合得分排名，颜色编码直观展示适宜性等级
6. 权重变化时实时重新计算所有候选点得分和排名

【API】
• scene.pickPosition: 从屏幕坐标获取三维空间坐标
• Entity.point: 点实体，color 根据得分等级动态变化
• HeightReference.CLAMP_TO_GROUND: 标签贴地显示
• watch(factors, { deep: true }): 深度监听权重变化，触发重算
• 加权评分公式: score = Σ(因子得分 × 权重) / Σ权重`,
  'clear': () => `【原理】清除 = 批量移除实体 + 重置数据：
1. 遍历 siteEntities 数组，逐个移除候选点实体
2. 重置 candidates、siteIdCounter 等数据

【要点】清除操作会移除所有候选点，不可撤销。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" type="success" @click="applyAdd">添加候选点</n-button>
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="site-selection-split"
    >
      <template #scene-overlay>
        <div class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white">
          {{ statusText }}
        </div>
      </template>

    <template #bottom-panel>
      <div class="border-t border-gray-200 bg-gray-50 p-4">
        <!-- 权重设置 -->
        <div class="mb-4">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-semibold text-gray-700">评价因子权重</span>
            <n-button size="tiny" quaternary @click="resetWeights">重置为20%</n-button>
          </div>
          <div class="grid grid-cols-5 gap-2">
            <div v-for="factor in factors" :key="factor.key" class="text-center">
              <div class="mb-1 text-xs text-gray-600">{{ factor.name }}</div>
              <n-input-number
                v-model:value="factor.weight"
                :min="0"
                :max="100"
                size="tiny"
                style="width: 100%"
              />
            </div>
          </div>
          <div class="mt-1 text-right text-xs text-gray-400">权重总和: {{ totalWeight }}%</div>
        </div>

        <!-- 候选点排名 -->
        <div class="mb-2 text-sm font-semibold text-gray-700">候选点排名（共 {{ candidates.length }} 个）</div>
        <div v-if="candidates.length === 0" class="py-4 text-center text-xs text-gray-400">
          暂无候选点，点击「添加候选点」在地图上选择位置
        </div>
        <div v-else class="max-h-48 space-y-2 overflow-auto">
          <div
            v-for="site in rankedCandidates"
            :key="site.id"
            class="rounded-lg border border-gray-200 bg-white p-2"
          >
            <div class="flex items-center gap-2">
              <span
                class="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                :style="{ backgroundColor: getGradeColor(site.totalScore) }"
              >{{ site.rank }}</span>
              <span class="text-xs font-semibold text-gray-700">{{ site.name }}</span>
              <span class="text-xs text-gray-500">
                {{ site.longitude.toFixed(4) }}°E, {{ site.latitude.toFixed(4) }}°N
              </span>
              <span class="ml-auto text-sm font-bold" :style="{ color: getGradeColor(site.totalScore) }">
                {{ site.totalScore.toFixed(1) }}分
              </span>
              <span
                class="rounded px-1.5 py-0.5 text-xs text-white"
                :style="{ backgroundColor: getGradeColor(site.totalScore) }"
              >{{ site.grade }}</span>
              <n-button size="tiny" type="primary" quaternary @click="flyToSite(site.id)">定位</n-button>
              <n-button size="tiny" type="error" quaternary @click="removeSite(site.id)">删除</n-button>
            </div>
            <!-- 各因子得分条 -->
            <div class="mt-2 grid grid-cols-5 gap-1">
              <div v-for="factor in factors" :key="factor.key" class="text-center">
                <div class="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    class="h-full rounded-full"
                    :style="{ width: site.scores[factor.key] + '%', backgroundColor: factor.color }"
                  ></div>
                </div>
                <div class="mt-0.5 text-xs text-gray-500">{{ site.scores[factor.key].toFixed(0) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
    </SplitViewer>
  </div>
</template>
