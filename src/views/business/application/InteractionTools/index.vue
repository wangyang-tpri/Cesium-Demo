<template>
  <div v-if="!isChild" class="h-full overflow-auto bg-gray-50 p-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-800">交互工具类</h1>
      <p class="mt-2 text-sm text-gray-500">
        提供地图交互常用工具：坐标拾取、图元绘制、标注工具、图层切换
      </p>
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="item in cards"
        :key="item.key"
        class="cursor-pointer rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-400 hover:shadow-md"
        @click="goTo(item.key)"
      >
        <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg" :style="{ background: item.bgColor }">
          <span class="text-xl">{{ item.icon }}</span>
        </div>
        <h3 class="text-base font-semibold text-gray-800">{{ item.title }}</h3>
        <p class="mt-1 text-xs text-gray-500">{{ item.desc }}</p>
      </div>
    </div>
  </div>
  <router-view v-else />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const cards = [
  { key: 'coordinate-pick', title: '坐标拾取', desc: '点击地图获取经纬度、高程、屏幕坐标', icon: '📍', bgColor: '#e8f5e9' },
  { key: 'primitive-draw', title: '图元绘制', desc: '绘制点、线、面、圆、矩形等基本图元', icon: '✏️', bgColor: '#e3f2fd' },
  { key: 'annotation', title: '标注工具', desc: '添加文字标注、图标标注，支持样式设置', icon: '🏷️', bgColor: '#fff3e0' },
  { key: 'layer-switch', title: '图层切换', desc: '底图切换、地形开关、图层透明度控制', icon: '🗺️', bgColor: '#f3e5f5' },
];

const isChild = computed(() => route.path !== '/application/interaction-tools');

function goTo(key: string) {
  router.push({ name: key });
}
</script>
