<template>
  <div v-if="!isChild" class="h-full overflow-auto bg-gray-50 p-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-800">场景应用</h1>
      <p class="mt-2 text-sm text-gray-500">
        三维场景基础应用：飞行漫游、三维量测、轨迹模拟
      </p>
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
  { key: 'flight', title: '飞行漫游', desc: '沿预设路径自动飞行浏览三维场景', icon: '🚀', bgColor: '#e3f2fd' },
  { key: 'measure', title: '三维量测', desc: '距离、面积、高度等空间尺寸测量', icon: '📏', bgColor: '#e8f5e9' },
  { key: 'trajectory', title: '轨迹模拟', desc: '物体运动轨迹模拟与视角跟随', icon: '📍', bgColor: '#fff3e0' },
];

const isChild = computed(() => route.path !== '/application/scene-application');

function goTo(key: string) {
  router.push({ name: key });
}
</script>
