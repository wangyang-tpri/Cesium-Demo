<script setup lang="ts">
import * as Cesium from "cesium";
import { ref, provide } from "vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";
import SplitViewer from "@/components/base/SplitViewer.vue";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref("geojson");
const statusText = ref("GeoJSON / KML / CZML 三种空间数据格式加载。");

// 时钟：覆盖 CZML 演示的 10 分钟时间窗
const czmlStart = Cesium.JulianDate.fromIso8601("2026-01-01T00:00:00Z");
const czmlStop = Cesium.JulianDate.fromIso8601("2026-01-01T00:10:00Z");

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-img",
  camera: { position: [108.94, 34.34, 300000], pitch: -60 },
  ui: { animation: true, timeline: true },
  clock: {
    start: czmlStart,
    stop: czmlStop,
    currentTime: czmlStart,
    multiplier: 60,
    shouldAnimate: true,
    range: Cesium.ClockRange.LOOP_STOP,
  },
});

// 分割条拖拽时通知 viewer 重新计算渲染尺寸
function onSplitChange() {
  viewer.value?.resize();
}

const loaded: Cesium.CustomDataSource[] = [];

function removeAll() {
  const v = viewer.value;
  if (!v) return;
  for (const ds of loaded) v.dataSources.remove(ds);
  loaded.length = 0;
}

/* ---------- GeoJSON（内嵌示例数据） ---------- */

const SAMPLE_GEOJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "西安市区范围", level: "市级" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [108.6, 34.0],
            [109.4, 34.0],
            [109.4, 34.45],
            [108.6, 34.45],
            [108.6, 34.0],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { name: "钟楼", kind: "POI" },
      geometry: { type: "Point", coordinates: [108.94, 34.342] },
    },
    {
      type: "Feature",
      properties: { name: "大雁塔", kind: "POI" },
      geometry: { type: "Point", coordinates: [108.97, 34.218] },
    },
    {
      type: "Feature",
      properties: { name: "浐灞生态区", kind: "公园" },
      geometry: {
        type: "MultiLineString",
        coordinates: [
          [
            [108.98, 34.33],
            [109.0, 34.35],
            [109.02, 34.37],
          ],
        ],
      },
    },
  ],
} as const;

async function applyGeoJson() {
  activeFeature.value = "geojson";
  removeAll();
  const v = viewer.value;
  if (!v) return;
  statusText.value = "正在加载 GeoJSON…";
  const ds = await Cesium.GeoJsonDataSource.load(
    JSON.stringify(SAMPLE_GEOJSON),
    {
      stroke: Cesium.Color.fromCssColorString("#3498db"),
      strokeWidth: 2.5,
      fill: Cesium.Color.fromCssColorString("#3498db").withAlpha(0.35),
      markerSymbol: "●",
      clampToGround: true,
    }
  );
  v.dataSources.add(ds);
  loaded.push(ds as unknown as Cesium.CustomDataSource);
  statusText.value = `GeoJSON 加载完成：${ds.entities.values.length} 个要素（面/点/线）`;
}

/* ---------- KML（内嵌示例数据） ---------- */

const SAMPLE_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>西安示例</name>
    <Style id="poiStyle">
      <IconStyle>
        <color>ff3355ff</color>
        <scale>1.2</scale>
        <Icon><href>https://maps.google.com/mapfiles/kml/pushpin/red-pushpin.png</href></Icon>
      </IconStyle>
      <LabelStyle>
        <color>ffffffff</color>
        <scale>1.0</scale>
      </LabelStyle>
    </Style>
    <Placemark>
      <name>西安世博园</name>
      <description>2026 年世园会主会场</description>
      <styleUrl>#poiStyle</styleUrl>
      <Point>
        <coordinates>109.05,34.35,0</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>昆明池</name>
      <styleUrl>#poiStyle</styleUrl>
      <Point>
        <coordinates>108.77,34.2,0</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>渭河湿地</name>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          108.7,34.4,0 108.9,34.42,0 109.1,34.44,0
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

async function applyKml() {
  activeFeature.value = "kml";
  removeAll();
  const v = viewer.value;
  if (!v) return;
  statusText.value = "正在加载 KML…";
  const ds = await Cesium.KmlDataSource.load(SAMPLE_KML, {
    camera: v.camera,
    canvas: v.scene.canvas,
  });
  v.dataSources.add(ds);
  loaded.push(ds as unknown as Cesium.CustomDataSource);
  statusText.value = `KML 加载完成：${ds.entities.values.length} 个地标`;
}

/* ---------- CZML（内嵌示例数据：动态卫星） ---------- */

function buildCzml(): string {
  // 程序化生成卫星轨迹采样（绕西安上空 10 分钟一圈）
  const samples: number[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = i * 120; // 每 120 秒一个采样
    const a = (i / steps) * Cesium.Math.TWO_PI;
    const pos = Cesium.Cartesian3.fromDegrees(
      108.94 + Math.cos(a) * 0.35,
      34.34 + Math.sin(a) * 0.28,
      150000 + Math.sin(a * 2) * 40000
    );
    samples.push(t, pos.x, pos.y, pos.z);
  }
  const czml = [
    {
      id: "document",
      version: "1.0",
      clock: {
        interval: "2026-01-01T00:00:00Z/2026-01-01T00:10:00Z",
        currentTime: "2026-01-01T00:00:00Z",
        multiplier: 60,
        range: "LOOP_STOP",
      },
    },
    {
      id: "satellite",
      name: "演示卫星",
      availability: "2026-01-01T00:00:00Z/2026-01-01T00:10:00Z",
      position: {
        interpolationAlgorithm: "LAGRANGE",
        interpolationDegree: 2,
        epoch: "2026-01-01T00:00:00Z",
        cartesian: samples,
      },
      point: {
        pixelSize: 12,
        color: { rgba: [255, 80, 80, 255] },
        outlineColor: { rgba: [255, 255, 255, 255] },
        outlineWidth: 2,
      },
      label: {
        text: "CZML 卫星",
        font: "13px Microsoft YaHei",
        fillColor: { rgba: [255, 255, 255, 255] },
        outlineColor: { rgba: [0, 0, 0, 255] },
        outlineWidth: 3,
        verticalOrigin: "BOTTOM",
        pixelOffset: { cartesian2: [0, -26] },
      },
      path: {
        material: {
          polylineGlow: {
            color: { rgba: [255, 200, 60, 200] },
            glowPower: 0.35,
          },
        },
        width: 4,
      },
    },
  ];
  return JSON.stringify(czml);
}

async function applyCzml() {
  activeFeature.value = "czml";
  removeAll();
  const v = viewer.value;
  if (!v) return;
  statusText.value = "正在加载 CZML（时间动态数据）…";
  const ds = await Cesium.CzmlDataSource.load(buildCzml());
  v.dataSources.add(ds);
  loaded.push(ds as unknown as Cesium.CustomDataSource);
  statusText.value = "CZML 加载完成：点击 ▶ 播放，卫星沿插值轨迹运动";
}

/* ---------- 数据源样式化 ---------- */

function applyStyle() {
  activeFeature.value = "style";
  const v = viewer.value;
  if (!v) return;
  // 1.145：直接取第一个数据源，任何 DataSource 都有 entities
  const ds = v.dataSources.get(0);
  if (!ds) {
    statusText.value = "请先加载一种数据";
    return;
  }
  ds.entities.values.forEach((e) => {
    const poly = e.polygon;
    if (poly?.material instanceof Cesium.ColorMaterialProperty) {
      poly.material = new Cesium.ColorMaterialProperty(
        Cesium.Color.fromCssColorString("#e67e22").withAlpha(0.5)
      );
    }
  });
  statusText.value = `已修改数据源样式：全部面要素改为橙色`;
}

function applyClear() {
  activeFeature.value = "geojson";
  removeAll();
  statusText.value = "已清除全部数据源";
}

const codeMap: Record<string, () => string> = {
  geojson: () => `// ① GeoJSON：矢量数据标准格式
const ds = await Cesium.GeoJsonDataSource.load(
  urlOrString, {
    stroke: Cesium.Color.fromCssColorString('#3498db'),
    strokeWidth: 2.5,
    fill: Cesium.Color.fromCssColorString('#3498db')
             .withAlpha(0.35),
    clampToGround: true,
  })
viewer.dataSources.add(ds)
// 支持 FeatureCollection / Point / Polygon / LineString…`,

  kml: () => `// ② KML：Google Earth 格式
const ds = await Cesium.KmlDataSource.load(
  urlOrString, {
    camera: viewer.camera,
    canvas: viewer.scene.canvas,
  })
viewer.dataSources.add(ds)
// 支持 Placemark / Style / 时间戳等`,

  czml: () => `// ③ CZML：Cesium 时间动态数据格式
const ds = await Cesium.CzmlDataSource.load(czmlString)
viewer.dataSources.add(ds)
// document.clock 驱动时间轴；
// position.cartesian 采样 + 插值 → 平滑运动`,
};

const explainMap: Record<string, () => string> = {
  geojson: () => `【原理】GeoJsonDataSource 把 GeoJSON 映射为 Entity：
• Point → point + label
• Polygon → polygon（可贴地 clampToGround）
• LineString → polyline
• 属性(properties) 自动变为 entity 的自定义属性

【要点】数据可作为字符串/URL/File 传入；
加载选项 stroke/fill/markerSymbol 控制默认样式。`,

  kml: () => `【原理】KML 是 Google Earth 时代的开放格式（OGC 标准），
KmlDataSource 支持：Placemark、Style（Icon/Label）、LineString、多边形、
时间戳（TimeStamp/TimeSpan，可联动时钟）。

【要点】KML 中的网络资源（图标等）需要外网可达；
本示例使用内嵌数据，离线可用。`,

  czml: () => `【原理】CZML 是 Cesium 原生数据格式，专为“时间动态”设计：
• document.clock 定义时间轴
• position.cartesian 采样关键帧 + interpolationAlgorithm 插值
• path/polylineGlow 生成运动轨迹

【观察】加载后播放 ▶，卫星按拉格朗日插值沿椭圆轨迹运动，
这正是“轨迹模拟”应用页的技术基础。`,
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
        :type="activeFeature === 'geojson' ? 'primary' : 'default'"
        @click="applyGeoJson"
        >加载 GeoJSON</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'kml' ? 'primary' : 'default'"
        @click="applyKml"
        >加载 KML</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'czml' ? 'primary' : 'default'"
        @click="applyCzml"
        >加载 CZML</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'style' ? 'primary' : 'default'"
        @click="applyStyle"
        >样式化数据源</n-button
      >
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="geojson-split"
      @split-change="onSplitChange"
    >
      <template #scene-overlay>
        <div
          class="absolute left-3 top-3 z-10 rounded bg-black/60 px-3 py-1.5 text-xs text-white"
        >
          {{ statusText }}
        </div>
      </template>
    </SplitViewer>
  </div>
</template>
