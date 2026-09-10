<template>
  <div v-if="!isChild" class="h-full overflow-auto bg-gray-50 p-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-800">行业应用类</h1>
      <p class="mt-2 text-sm text-gray-500">
        面向典型行业的三维可视化应用：智慧城市、水利监测、电力巡检、应急指挥
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
  { key: 'smart-city', title: '智慧城市', desc: '城市建筑、部件管理、人口热力可视化', icon: '🏙️', bgColor: '#e3f2fd' },
  { key: 'water-conservancy', title: '水利监测', desc: '水库水位、河道断面、洪水淹没模拟', icon: '💧', bgColor: '#e1f5fe' },
  { key: 'power-inspection', title: '电力巡检', desc: '输电线路、杆塔管理、走廊安全分析', icon: '⚡', bgColor: '#fff8e1' },
  { key: 'emergency-command', title: '应急指挥', desc: '灾害点标注、救援路径、资源调度', icon: '🚨', bgColor: '#ffebee' },
];

const isChild = computed(() => route.path !== '/application/industry-application');

function goTo(key: string) {
  router.push({ name: key });
}
</script>
