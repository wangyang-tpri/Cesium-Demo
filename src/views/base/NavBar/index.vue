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
  EyeOutline as VisibilityIcon,
  FlashOutline as EventIcon,
  FlaskOutline as ShaderIcon,
  GlobeOutline as GlobeIcon,
  GridOutline as GridIcon,
  LayersOutline as LayerIcon,
  LocateOutline as LocateIcon,
  MapOutline as MapIcon,
  PulseOutline as PulseIcon,
  RadioButtonOffOutline as BufferIcon,
  ResizeOutline as MeasureIcon,
  RocketOutline as FlightIcon,
  ShapesOutline as ShapesIcon,
  SparklesOutline as ParticlesIcon,
  TimeOutline as TimeIcon,
  TrendingUpOutline as ProfileIcon,
  WaterOutline as FloodIcon,
  LayersOutline as BasicIcon,
  RocketOutline as AdvancedIcon,
  AppsOutline as AppIcon,
  AnalyticsOutline as AnalysisIcon,
  NavigateOutline as PathIcon,
  LocationOutline as SiteIcon,
  ConstructOutline as PlanningIcon,
  NavigateOutline as ToolsIcon,
  PinOutline as PickIcon,
  BrushOutline as DrawIcon,
  PricetagOutline as AnnoIcon,
  LayersOutline as LayerSwitchIcon,
  FilmOutline as SceneIcon,
  BusinessOutline as IndustryIcon,
  HomeOutline as CityIcon,
  WaterOutline as WaterIcon,
  FlashOutline as PowerIcon,
  AlertCircleOutline as EmergencyIcon,
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
      {
        label: '场景应用',
        key: 'scene-application',
        icon: renderIcon(SceneIcon),
        children: [
          { label: '飞行漫游', key: 'flight', icon: renderIcon(FlightIcon) },
          { label: '三维量测', key: 'measure', icon: renderIcon(MeasureIcon) },
          { label: '轨迹模拟', key: 'trajectory', icon: renderIcon(PulseIcon) },
        ],
      },
      {
        label: '空间分析类',
        key: 'spatial-analysis',
        icon: renderIcon(AnalysisIcon),
        children: [
          { label: '通视分析', key: 'line-of-sight', icon: renderIcon(VisibilityIcon) },
          { label: '剖面分析', key: 'profile', icon: renderIcon(ProfileIcon) },
          { label: '缓冲区分析', key: 'buffer', icon: renderIcon(BufferIcon) },
          { label: '可视域分析', key: 'viewshed', icon: renderIcon(MapIcon) },
          { label: '淹没分析', key: 'flood', icon: renderIcon(FloodIcon) },
        ],
      },
      {
        label: '规划设计类',
        key: 'planning-design',
        icon: renderIcon(PlanningIcon),
        children: [
          { label: '路径规划', key: 'path-planning', icon: renderIcon(PathIcon) },
          { label: '区域划分', key: 'zone-division', icon: renderIcon(GridIcon) },
          { label: '选址分析', key: 'site-selection', icon: renderIcon(SiteIcon) },
          { label: '土方计算', key: 'earthwork', icon: renderIcon(CubeIcon) },
        ],
      },
      {
        label: '交互工具类',
        key: 'interaction-tools',
        icon: renderIcon(ToolsIcon),
        children: [
          { label: '坐标拾取', key: 'coordinate-pick', icon: renderIcon(PickIcon) },
          { label: '图元绘制', key: 'primitive-draw', icon: renderIcon(DrawIcon) },
          { label: '标注工具', key: 'annotation', icon: renderIcon(AnnoIcon) },
          { label: '图层切换', key: 'layer-switch', icon: renderIcon(LayerSwitchIcon) },
        ],
      },
      {
        label: '行业应用类',
        key: 'industry-application',
        icon: renderIcon(IndustryIcon),
        children: [
          { label: '智慧城市', key: 'smart-city', icon: renderIcon(CityIcon) },
          { label: '水利监测', key: 'water-conservancy', icon: renderIcon(WaterIcon) },
          { label: '电力巡检', key: 'power-inspection', icon: renderIcon(PowerIcon) },
          { label: '应急指挥', key: 'emergency-command', icon: renderIcon(EmergencyIcon) },
        ],
      },
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
  // 一级菜单直接匹配
  if (menuOptions.some((g) => g.key === name)) {
    expandedKeys.value = [name];
    return;
  }
  // 二级菜单匹配：找到包含当前路由的一级 group
  const group = menuOptions.find((g) => g.children?.some((c) => c.key === name));
  if (group) {
    expandedKeys.value = [group.key as string];
    return;
  }
  // 三级菜单匹配：找到包含当前路由的二级 group，并同时展开一级 group
  for (const g of menuOptions) {
    const subGroup = g.children?.find((c: any) => c.children?.some((cc: any) => cc.key === name));
    if (subGroup) {
      expandedKeys.value = [g.key as string, subGroup.key as string];
      return;
    }
  }
  expandedKeys.value = ['basics'];
});

function handleMenuSelect(key: string) {
  if (router.hasRoute(key)) router.push({ name: key });
}
</script>
