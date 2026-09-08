<template>
  <n-layout has-sider class="h-full">
    <n-layout-sider
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="240"
      :inverted="inverted"
    >
      <n-menu
        :inverted="inverted"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="menuOptions"
        :value="activeKey"
        :expanded-keys="expandedKeys"
        @update:expanded-keys="handleExpandedChange"
        @update:value="handleMenuSelect"
      />
    </n-layout-sider>
    <n-layout class="h-full">
      <router-view></router-view>
    </n-layout>
  </n-layout>
</template>

<script setup lang="ts">
import type { MenuOption } from 'naive-ui';
import type { Component } from 'vue';
import {
  CameraOutline as CameraIcon,
  ChatboxEllipsesOutline as LabelIcon,
  CloudDownloadOutline as ModelIcon,
  ColorFilterOutline as PostIcon,
  ColorPaletteOutline as MaterialIcon,
  CubeOutline as CubeIcon,
  FlashOutline as EventIcon,
  FlaskOutline as ShaderIcon,
  GlobeOutline as GlobeIcon,
  GridOutline as GridIcon,
  LayersOutline as LayerIcon,
  LocateOutline as LocateIcon,
  MapOutline as MapIcon,
  PulseOutline as PulseIcon,
  ResizeOutline as MeasureIcon,
  RocketOutline as FlightIcon,
  ShapesOutline as ShapesIcon,
  SparklesOutline as ParticlesIcon,
  TimeOutline as TimeIcon,
  LayersOutline as BasicIcon,
  RocketOutline as AdvancedIcon,
  AppsOutline as AppIcon,
} from '@vicons/ionicons5';
import { NIcon } from 'naive-ui';
import { computed, h, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

function renderIcon(icon: Component) {
  return () => h(NIcon, null, { default: () => h(icon) });
}

const menuOptions: MenuOption[] = [
  {
    label: '基础',
    key: 'basics',
    icon: renderIcon(BasicIcon),
    children: [
      { label: 'Viewer 入门', key: 'viewer', icon: renderIcon(GlobeIcon) },
      { label: '相机 Camera', key: 'camera', icon: renderIcon(CameraIcon) },
      { label: '影像与地形', key: 'imagery-terrain', icon: renderIcon(LayerIcon) },
      { label: '实体 Entity', key: 'entity', icon: renderIcon(ShapesIcon) },
      { label: '坐标系与转换', key: 'coordinates', icon: renderIcon(GridIcon) },
      { label: '材质 Material', key: 'material', icon: renderIcon(MaterialIcon) },
      { label: '事件与拾取', key: 'event', icon: renderIcon(EventIcon) },
      { label: '时钟与时间轴', key: 'clock', icon: renderIcon(TimeIcon) },
      { label: '图元 Primitive', key: 'primitive', icon: renderIcon(CubeIcon) },
      { label: '标注与广告牌', key: 'label-billboard', icon: renderIcon(LabelIcon) },
    ],
  },
  {
    label: '进阶',
    key: 'forward',
    icon: renderIcon(AdvancedIcon),
    children: [
      { label: '3D Tiles 加载', key: 'tileset', icon: renderIcon(CubeIcon) },
      { label: 'glTF 模型', key: 'model', icon: renderIcon(ModelIcon) },
      { label: '粒子系统', key: 'particles', icon: renderIcon(ParticlesIcon) },
      { label: '后期处理', key: 'post-process', icon: renderIcon(PostIcon) },
      { label: '深度拾取', key: 'picking', icon: renderIcon(LocateIcon) },
      { label: '空间数据加载', key: 'geojson', icon: renderIcon(MapIcon) },
      { label: '动态效果', key: 'dynamic', icon: renderIcon(TimeIcon) },
      { label: '自定义着色器', key: 'custom-shader', icon: renderIcon(ShaderIcon) },
    ],
  },
  {
    label: '应用',
    key: 'application',
    icon: renderIcon(AppIcon),
    children: [
      { label: '飞行漫游', key: 'flight', icon: renderIcon(FlightIcon) },
      { label: '三维量测', key: 'measure', icon: renderIcon(MeasureIcon) },
      { label: '轨迹模拟', key: 'trajectory', icon: renderIcon(PulseIcon) },
    ],
  },
];

const inverted = ref(false);

const router = useRouter();
const route = useRoute();

const activeKey = computed(() => String(route.name ?? ''));

const expandedKeys = ref<string[]>([]);

function handleExpandedChange(keys: string[]) {
  expandedKeys.value = keys;
}

// hash 路由首屏解析是异步的，等待路由就绪后再按当前路由设置初始展开，
onMounted(async () => {
  await router.isReady();
  const name = String(route.name ?? '');
  if (menuOptions.some((g) => g.key === name)) {
    expandedKeys.value = [name];
    return;
  }
  const group = menuOptions.find((g) => g.children?.some((c) => c.key === name));
  expandedKeys.value = group ? [group.key as string] : ['basics'];
});

function handleMenuSelect(key: string) {
  if (router.hasRoute(key)) router.push({ name: key });
}
</script>
