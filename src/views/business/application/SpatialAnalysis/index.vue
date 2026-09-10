<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router';
import { computed } from 'vue';
import {
  EyeOutline as VisibilityIcon,
  TrendingUpOutline as ProfileIcon,
  RadioButtonOffOutline as BufferIcon,
  MapOutline as ViewshedIcon,
  WaterOutline as FloodIcon,
} from '@vicons/ionicons5';
import { h } from 'vue';
import { NIcon } from 'naive-ui';

const router = useRouter();
const route = useRoute();

// 判断当前是否为索引页（卡片导航），否则为子功能页面
const isIndexPage = computed(() => route.name === 'spatial-analysis');

function renderIcon(icon: any) {
  return () => h(NIcon, null, { default: () => h(icon) });
}

const features = [
  {
    key: 'line-of-sight',
    title: '通视分析',
    desc: '判断两点之间是否可视，射线与地形求交，展示遮挡点',
    icon: VisibilityIcon,
    color: '#18a058',
  },
  {
    key: 'profile',
    title: '剖面分析',
    desc: '沿折线提取地形高程剖面，ECharts 二维图表联动展示',
    icon: ProfileIcon,
    color: '#2080f0',
  },
  {
    key: 'buffer',
    title: '缓冲区分析',
    desc: '对点/线/面要素生成指定半径的缓冲区，空间叠加可视化',
    icon: BufferIcon,
    color: '#f0a020',
  },
  {
    key: 'viewshed',
    title: '可视域分析',
    desc: '基于观察点和视锥体计算地形可视区域，GPU 着色器渲染',
    icon: ViewshedIcon,
    color: '#d03050',
  },
  {
    key: 'flood',
    title: '淹没分析',
    desc: '动态水位上升模拟，条件着色展示淹没区域，支持水位调节',
    icon: FloodIcon,
    color: '#0fc6c2',
  },
];

function goTo(key: string) {
  router.push({ name: key });
}
</script>

<template>
  <!-- 子功能页面：渲染具体的分析页面 -->
  <router-view v-if="!isIndexPage" />

  <!-- 索引页：卡片导航 -->
  <div v-else class="h-full overflow-auto p-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-800">空间分析类</h1>
      <p class="mt-2 text-sm text-gray-500">
        基于 Cesium 地形采样、几何计算和 GPU 着色器实现的空间分析功能集合
      </p>
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="item in features"
        :key="item.key"
        class="group cursor-pointer rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
        @click="goTo(item.key)"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-lg"
            :style="{ backgroundColor: item.color + '15' }"
          >
            <n-icon :size="24" :color="item.color">
              <component :is="item.icon" />
            </n-icon>
          </div>
          <h3 class="text-lg font-semibold text-gray-800 group-hover:text-blue-600">
            {{ item.title }}
          </h3>
        </div>
        <p class="mt-3 text-sm leading-relaxed text-gray-500">
          {{ item.desc }}
        </p>
        <div class="mt-4 flex items-center text-sm font-medium text-blue-500 opacity-0 transition-opacity group-hover:opacity-100">
          点击进入 →
        </div>
      </div>
    </div>
  </div>
</template>
