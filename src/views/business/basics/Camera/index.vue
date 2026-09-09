<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, ref, provide } from "vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";
import SplitViewer from "@/components/base/SplitViewer.vue";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref("setView");
const activeIndex = ref(0); // 当前选中的城市索引，用于区分同功能下的不同城市按钮
const statusText = ref("相机状态：");

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "esri",
  camera: { position: [108.9, 34.2, 3000000], pitch: -60 },
});

// 分割条拖拽时通知 viewer 重新计算渲染尺寸
function onSplitChange() {
  viewer.value?.resize();
}

// 四个演示目标城市
const CITIES = [
  { name: "北京", lon: 116.397, lat: 39.909, height: 8000 },
  { name: "西安", lon: 108.94, lat: 34.341, height: 6000 },
  { name: "上海", lon: 121.4737, lat: 31.2304, height: 8000 },
  { name: "广州", lon: 113.2644, lat: 23.1291, height: 8000 },
];

// 场景标记点（供 lookAt / 包围球演示）
const markers: Cesium.Entity[] = [];
function buildMarkers() {
  const s = viewer.value;
  if (!s || markers.length) return;
  for (const c of CITIES) {
    markers.push(
      s.entities.add({
        position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, 0),
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString("#4a9eff"),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: c.name,
          font: "14px sans-serif",
          pixelOffset: new Cesium.Cartesian2(0, -24),
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        },
      })
    );
  }
}

function applySetView(index: number) {
  activeFeature.value = "setView";
  activeIndex.value = index;
  const c = CITIES[index]!;
  viewer.value?.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, c.height),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-45), roll: 0 },
  });
  statusText.value = `setView：瞬间跳转到 ${c.name}`;
}

function applyFlyTo(index: number) {
  activeFeature.value = "flyTo";
  activeIndex.value = index;
  const c = CITIES[index]!;
  viewer.value?.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, c.height),
    orientation: {
      heading: Cesium.Math.toRadians(20),
      pitch: Cesium.Math.toRadians(-45),
      roll: 0,
    },
    duration: 2.5, // 飞行时长（秒）
    complete: () => (statusText.value = `flyTo：已到达 ${c.name}`),
  });
  statusText.value = `flyTo：正在飞往 ${c.name} ...`;
}

function applyLookAt() {
  activeFeature.value = "lookAt";
  activeIndex.value = -1;
  const v = viewer.value;
  if (!v) return;
  const target = Cesium.Cartesian3.fromDegrees(108.94, 34.341, 0);
  // lookAt 相机不动，观察方向指向目标点；offset 为相对目标的偏移（HeadingPitchRange）
  v.camera.lookAt(
    target,
    new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-35), 25000)
  );
  statusText.value = "lookAt：相机看向西安钟楼（偏移 25km 高空）";
}

function applyBoundingSphere() {
  activeFeature.value = "boundingSphere";
  activeIndex.value = -1;
  const v = viewer.value;
  if (!v) return;
  // 用所有标记点生成包围球，一键飞到能把它们全部框住的视角
  const positions = CITIES.map((c) =>
    Cesium.Cartesian3.fromDegrees(c.lon, c.lat, 0)
  );
  const sphere = Cesium.BoundingSphere.fromPoints(positions);
  v.camera.flyToBoundingSphere(sphere, {
    duration: 2.5,
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-60), 0),
  });
  statusText.value = "flyToBoundingSphere：自动取景全部城市";
}

function applyPosition() {
  activeFeature.value = "position";
  activeIndex.value = -1;
  const cam = viewer.value?.camera;
  if (!cam) return;
  const carto = cam.positionCartographic;
  if (carto) {
    statusText.value =
      `相机位置：经度 ${Cesium.Math.toDegrees(carto.longitude).toFixed(4)}°，` +
      `纬度 ${Cesium.Math.toDegrees(carto.latitude).toFixed(4)}°，` +
      `高度 ${(carto.height / 1000).toFixed(1)} km；` +
      `朝向 heading ${Cesium.Math.toDegrees(cam.heading).toFixed(1)}°`;
  }
}

function applyReset() {
  activeFeature.value = "setView";
  activeIndex.value = 0;
  viewer.value?.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(108.9, 34.2, 3000000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-60), roll: 0 },
    duration: 1.2,
  });
  statusText.value = "相机状态：";
}

onMounted(() => {
  buildMarkers();
});

const codeMap: Record<string, () => string> = {
  setView: () => `// ① setView：瞬间定位（无动画）
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(
    116.397, 39.909, 8000),   // 经度、纬度、高度(米)
  orientation: {
    heading: Cesium.Math.toRadians(0),    // 朝向角(度→弧度)
    pitch:   Cesium.Math.toRadians(-45),  // 俯仰角(向下为负)
    roll:    Cesium.Math.toRadians(0),    // 翻滚角
  },
})`,

  flyTo: () => `// ② flyTo：带飞行动画过渡
viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(121.47, 31.23, 8000),
  orientation: {
    heading: Cesium.Math.toRadians(20),
    pitch:   Cesium.Math.toRadians(-45),
    roll:    0,
  },
  duration: 2.5,   // 飞行时长（秒）
  complete: () => console.log('到达！'),  // 到达回调
  cancel:   () => console.log('被中断'),
})`,

  lookAt: () => `// ③ lookAt：相机位置不变，视线锁定目标
const target = Cesium.Cartesian3.fromDegrees(108.94, 34.341, 0)
viewer.camera.lookAt(
  target,
  new Cesium.HeadingPitchRange(
    0,                              // heading 相对目标的方位
    Cesium.Math.toRadians(-35),     // pitch   俯仰
    25000                           // range   相机离目标距离(米)
  )
)
// ★ 之后相机围绕目标点旋转/缩放，不再飞走`,

  boundingSphere: () => `// ④ flyToBoundingSphere：按包围球自动取景
const positions = cities.map(c =>
  Cesium.Cartesian3.fromDegrees(c.lon, c.lat, 0))
const sphere = Cesium.BoundingSphere.fromPoints(positions)

viewer.camera.flyToBoundingSphere(sphere, {
  duration: 2.5,
  offset: new Cesium.HeadingPitchRange(
    0, Cesium.Math.toRadians(-60), 0), // 距球心距离
})`,

  position: () => `// ⑤ 读取相机状态
const cam = viewer.camera
const carto = cam.positionCartographic   // 经纬度+高度
console.log(
  Cesium.Math.toDegrees(carto.longitude), // 经度
  Cesium.Math.toDegrees(carto.latitude),  // 纬度
  carto.height                            // 高度(米)
)
// cam.heading / pitch / roll 为当前朝向（弧度）`,
};

const explainMap: Record<string, () => string> = {
  setView: () => `【原理】setView 立即把相机放到指定位置和朝向，无过渡动画。
destination 即相机所在位置（地固系笛卡尔坐标，由经纬度+高度换算）。
orientation 的 heading/pitch/roll 控制朝向：
• heading：绕地轴旋转的方位角（正北为 0，顺时针为正）
• pitch：俯仰角（水平为 0，俯视为负）
• roll：翻滚角（通常为 0）

【观察】点击“北京/西安/上海/广州”，画面瞬间切换。`,

  flyTo:
    () => `【原理】flyTo 在 duration 秒内做平滑插值飞行（默认 easeInOut 曲线），
中途可被用户操作或下一次 flyTo 打断，触发 cancel 回调。

【参数】
• destination：目标位置（Cartesian3.fromDegrees 便捷构造）
• orientation：到达后的朝向
• duration：飞行秒数
• complete / cancel：成功 / 中断回调

【要点】连续调用 flyTo 会取消上一次飞行，实现“飞行队列”需要自行编排。`,

  lookAt:
    () => `【原理】lookAt 把相机固定在与目标相对偏移的位置，视线始终对准目标。
HeadingPitchRange 描述相机相对目标的位置：
• heading：绕目标水平旋转角
• pitch：相对目标的高低位（负值为从上方看）
• range：与目标的直线距离（米）

【观察】点击后相机“钉”在西安钟楼上方 25km 处，拖拽/缩放都围绕它进行。`,

  boundingSphere:
    () => `【原理】BoundingSphere（包围球）是 Cesium 空间计算的基础：
用最小外接球包住一组点/对象。flyToBoundingSphere 依据包围球自动
计算合适的相机距离与视角，常用于“一键框选全部要素”。

【要点】offset 可微调最终视角；duration 控制动画时长。`,

  position: () => `【原理】camera.positionCartographic 实时返回相机当前
经纬度(Cartographic)与高度。heading/pitch/roll 同理可读。

【用途】实现“保存视角书签”“跟随目标”“无人机第一人称”等功能时
需要不断读取并更新相机状态。`,
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
        :type="activeFeature === 'setView' && activeIndex === 0 ? 'primary' : 'default'"
        @click="applySetView(0)"
        >setView · 北京</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'setView' && activeIndex === 1 ? 'primary' : 'default'"
        @click="applySetView(1)"
        >setView · 西安</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'flyTo' && activeIndex === 2 ? 'primary' : 'default'"
        @click="applyFlyTo(2)"
        >flyTo · 上海</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'flyTo' && activeIndex === 3 ? 'primary' : 'default'"
        @click="applyFlyTo(3)"
        >flyTo · 广州</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'lookAt' ? 'primary' : 'default'"
        @click="applyLookAt"
        >lookAt · 西安钟楼</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'boundingSphere' ? 'primary' : 'default'"
        @click="applyBoundingSphere"
        >包围球取景</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'position' ? 'primary' : 'default'"
        @click="applyPosition"
        >读取相机状态</n-button
      >
      <n-button size="small" quaternary @click="applyReset">重置</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="camera-split"
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
