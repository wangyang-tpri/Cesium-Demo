<script setup lang="ts">
import * as Cesium from "cesium";
import { ref, provide, onMounted, onUnmounted, watch } from "vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";
import SplitViewer from "@/components/base/SplitViewer.vue";
import * as echarts from "echarts";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref("analyze");
const statusText = ref(
  "剖面分析：在地图上点击添加剖面线顶点，点击「完成」生成高程剖面图。"
);

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-img",
  camera: { position: [108.94, 34.15, 25000], pitch: -55 },
});

let picking = false;
let points: Cesium.Cartesian3[] = [];
let pointEntities: Cesium.Entity[] = [];
let lineEntity: Cesium.Entity | null = null;
let profileLineEntity: Cesium.Entity | null = null;
let handler: Cesium.ScreenSpaceEventHandler | null = null;

// ECharts 实例
let chartInstance: echarts.ECharts | null = null;
const chartRef = ref<HTMLDivElement | null>(null);

function initChart() {
  if (!chartRef.value) return;
  chartInstance = echarts.init(chartRef.value);
  chartInstance.setOption({
    title: {
      text: "地形高程剖面",
      left: "center",
      textStyle: { fontSize: 14 },
    },
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const p = params[0];
        return `距离: ${p.value[0].toFixed(0)} m<br/>高程: ${p.value[1].toFixed(
          1
        )} m`;
      },
    },
    grid: { left: 60, right: 20, top: 50, bottom: 40 },
    xAxis: {
      type: "value",
      name: "距离 (m)",
      nameLocation: "middle",
      nameGap: 25,
    },
    yAxis: {
      type: "value",
      name: "高程 (m)",
      nameLocation: "middle",
      nameGap: 45,
    },
    series: [
      {
        type: "line",
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2, color: "#2080f0" },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(32,128,240,0.4)" },
            { offset: 1, color: "rgba(32,128,240,0.05)" },
          ]),
        },
        data: [],
      },
    ],
  });
}

function clearAll() {
  const v = viewer.value;
  if (!v) return;
  for (const e of pointEntities) v.entities.remove(e);
  pointEntities = [];
  if (lineEntity) {
    v.entities.remove(lineEntity);
    lineEntity = null;
  }
  if (profileLineEntity) {
    v.entities.remove(profileLineEntity);
    profileLineEntity = null;
  }
  points = [];
  if (chartInstance) chartInstance.setOption({ series: [{ data: [] }] });
}

function pickPoint(windowPos: Cesium.Cartesian2): Cesium.Cartesian3 | null {
  const v = viewer.value;
  if (!v) return null;
  const ray = v.camera.getPickRay(windowPos);
  if (!ray) return null;
  return v.scene.globe.pick(ray, v.scene) || null;
}

function startPicking() {
  clearAll();
  picking = true;
  statusText.value =
    "请在地图上点击添加剖面线顶点（至少2个点），点击「完成」生成剖面...";
  if (!handler) {
    const v = viewer.value!;
    handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
    handler.setInputAction((click: any) => {
      if (!picking) return;
      const pos = pickPoint(click.position);
      if (!pos) return;
      points.push(pos);
      const entity = v.entities.add({
        position: pos,
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString("#2080f0"),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: `P${points.length}`,
          font: "12px sans-serif",
          pixelOffset: new Cesium.Cartesian2(0, -20),
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        },
      });
      pointEntities.push(entity);
      // 更新临时连线
      if (lineEntity) v.entities.remove(lineEntity);
      if (points.length >= 2) {
        lineEntity = v.entities.add({
          polyline: {
            positions: [...points],
            width: 2,
            material: Cesium.Color.fromCssColorString("#2080f0").withAlpha(0.6),
            dashPattern: 255,
          } as any,
        });
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }
}

async function finishPicking() {
  if (points.length < 2) {
    statusText.value = "⚠ 至少需要 2 个点才能生成剖面";
    return;
  }
  picking = false;
  const v = viewer.value;
  if (!v) return;
  statusText.value = "正在采样地形高程，生成剖面图...";

  // 沿折线密集采样
  const SAMPLES_PER_SEG = 50;
  const cartographics: Cesium.Cartographic[] = [];
  const distances: number[] = [];
  let cumulativeDist = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const segDist = Cesium.Cartesian3.distance(p1, p2);
    for (let j = 0; j < SAMPLES_PER_SEG; j++) {
      const t = j / SAMPLES_PER_SEG;
      const pos = Cesium.Cartesian3.lerp(p1, p2, t, new Cesium.Cartesian3());
      cartographics.push(Cesium.Cartographic.fromCartesian(pos));
      distances.push(cumulativeDist + segDist * t);
    }
    cumulativeDist += segDist;
  }
  // 最后一个点
  cartographics.push(
    Cesium.Cartographic.fromCartesian(points[points.length - 1])
  );
  distances.push(cumulativeDist);

  // 高精度地形采样
  const terrainProvider = v.terrainProvider;
  const updatedPositions = await Cesium.sampleTerrainMostDetailed(
    terrainProvider,
    cartographics
  );

  // 构建 ECharts 数据
  const chartData = distances.map((d, i) => [
    d,
    updatedPositions[i]?.height ?? 0,
  ]);

  // 更新图表
  if (chartInstance) {
    chartInstance.setOption({
      series: [{ data: chartData }],
      xAxis: { max: cumulativeDist },
    });
  }

  // 在地图上绘制剖面线（用实际地形高度）
  const profilePositions = updatedPositions.map((c) =>
    Cesium.Cartographic.toCartesian(c)
  );
  if (profileLineEntity) v.entities.remove(profileLineEntity);
  profileLineEntity = v.entities.add({
    polyline: {
      positions: profilePositions,
      width: 5,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.25,
        color: Cesium.Color.fromCssColorString("#2080f0"),
      }),
    },
  });

  // 统计信息
  const heights = chartData.map((d) => d[1]);
  const minH = Math.min(...heights);
  const maxH = Math.max(...heights);
  const avgH = heights.reduce((a, b) => a + b, 0) / heights.length;
  statusText.value = `✅ 剖面生成完成：总长 ${(cumulativeDist / 1000).toFixed(
    2
  )} km | 最高 ${maxH.toFixed(0)}m | 最低 ${minH.toFixed(
    0
  )}m | 平均 ${avgH.toFixed(0)}m`;
}

function applyAnalyze() {
  activeFeature.value = "analyze";
  startPicking();
}

function applyFinish() {
  activeFeature.value = "analyze";
  finishPicking();
}

function applyClear() {
  activeFeature.value = "analyze";
  picking = false;
  clearAll();
  statusText.value = "已清除，点击「开始分析」重新绘制剖面线。";
}

// SplitViewer 右侧面板底部显示 ECharts 图表
const showChart = ref(false);
watch(activeFeature, () => {
  setTimeout(() => {
    if (chartRef.value && !chartInstance) initChart();
  }, 100);
});

onMounted(() => {
  setTimeout(() => {
    if (chartRef.value) initChart();
  }, 500);
});

onUnmounted(() => {
  if (handler) handler.destroy();
  if (chartInstance) chartInstance.dispose();
});

const codeMap: Record<string, () => string> = {
  analyze: () => `// ① 沿折线密集采样
const SAMPLES_PER_SEG = 50
for (let i = 0; i < points.length - 1; i++) {
  for (let j = 0; j < SAMPLES_PER_SEG; j++) {
    const t = j / SAMPLES_PER_SEG
    const pos = Cartesian3.lerp(p1, p2, t)
    cartographics.push(Cartographic.fromCartesian(pos))
    distances.push(cumulativeDist + segDist * t)
  }
}

// ② 高精度地形采样
const positions = await sampleTerrainMostDetailed(
  terrainProvider, cartographics)

// ③ ECharts 绘制距离-高程剖面
chart.setOption({
  xAxis: { type: 'value', name: '距离 (m)' },
  yAxis: { type: 'value', name: '高程 (m)' },
  series: [{ type: 'line', smooth: true,
    data: distances.map((d, i) => [d, positions[i].height]) }]
})

// ④ 地图上绘制实际地形剖面线
const profilePositions = positions.map(c => Cartographic.toCartesian(c))
viewer.entities.add({ polyline: { positions: profilePositions, ... } })`,
};

const explainMap: Record<string, () => string> = {
  analyze: () => `【原理】剖面分析 = 折线采样 + 地形高程 + 二维图表：
1. 用户在地图上点击多个顶点，形成折线
2. 沿折线每段密集采样 N 个点，计算每个点到起点的累计距离
3. sampleTerrainMostDetailed 获取每个采样点的地形高程
4. ECharts 绘制"距离-高程"二维剖面图（平滑曲线 + 面积填充）
5. 地图上用实际地形高度绘制剖面线，与二维图联动

【API】
• sampleTerrainMostDetailed：高精度地形采样（异步）
• Cartesian3.lerp：两点线性插值
• Cartesian3.distance：两点距离
• echarts.init / setOption：ECharts 图表初始化与更新

【要点】每段采样点越多，剖面越平滑但越慢；
地形采样是异步的，需 await；图表与三维地图可联动高亮。`,
};

const { code, explanation } = useCodeExplain(
  codeMap,
  explainMap,
  activeFeature
);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button
        size="small"
        :type="activeFeature === 'analyze' ? 'primary' : 'default'"
        @click="applyAnalyze"
        >开始分析</n-button
      >
      <n-button size="small" type="success" @click="applyFinish">完成</n-button>
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="60"
      storage-key="profile-split"
    >
      <template #scene-overlay>
        <div
          class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white"
        >
          {{ statusText }}
        </div>
      </template>
      <template #bottom-panel>
        <div ref="chartRef" class="h-48 w-full border-t border-gray-200"></div>
      </template>
    </SplitViewer>
  </div>
</template>
