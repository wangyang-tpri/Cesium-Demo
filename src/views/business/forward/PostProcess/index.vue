<script setup lang="ts">
import * as Cesium from "cesium";
import { onMounted, ref, provide } from "vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";
import SplitViewer from "@/components/base/SplitViewer.vue";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref("blur");
const statusText = ref("后期处理：对整帧画面做像素级滤镜（全屏后处理）。");

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-img",
  camera: { position: [108.94, 34.34, 2500], pitch: -45 },
});

// 分割条拖拽时通知 viewer 重新计算渲染尺寸
function onSplitChange() {
  viewer.value?.resize();
}

// 1.145：边缘检测/轮廓描边返回 PostProcessStageComposite（复合阶段）
const stages: (Cesium.PostProcessStage | Cesium.PostProcessStageComposite)[] =
  [];

function removeAll() {
  const v = viewer.value;
  if (!v) return;
  for (const s of stages) v.scene.postProcessStages.remove(s);
  stages.length = 0;
}

onMounted(() => {
  // 提供一些彩色要素，方便观察滤镜效果
  const v = viewer.value;
  if (!v) return;
  for (let i = 0; i < 6; i++) {
    v.entities.add({
      position: Cesium.Cartesian3.fromDegrees(108.925 + i * 0.006, 34.34, 30),
      box: {
        dimensions: new Cesium.Cartesian3(30, 30, 60),
        material: Cesium.Color.fromHsl(i / 6, 0.8, 0.55).withAlpha(0.95),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
      },
    });
  }
});

function applyBlur() {
  activeFeature.value = "blur";
  removeAll();
  const v = viewer.value;
  if (!v) return;
  const stage = Cesium.PostProcessStageLibrary.createBlurStage();
  v.scene.postProcessStages.add(stage);
  stages.push(stage);
  statusText.value = "高斯模糊（createBlurStage）：画面整体柔化";
}

function applyEdge() {
  activeFeature.value = "edge";
  removeAll();
  const v = viewer.value;
  if (!v) return;
  // 边缘检测 → 轮廓描边（两阶段串联，返回复合阶段）
  const edge = Cesium.PostProcessStageLibrary.createEdgeDetectionStage();
  const silhouette = Cesium.PostProcessStageLibrary.createSilhouetteStage();
  silhouette.uniforms.color = Cesium.Color.LIME;
  v.scene.postProcessStages.add(edge);
  v.scene.postProcessStages.add(silhouette);
  stages.push(edge, silhouette);
  statusText.value = "边缘检测 + 轮廓描边（两阶段串联）";
}

function applyNight() {
  activeFeature.value = "night";
  removeAll();
  const v = viewer.value;
  if (!v) return;
  const stage = Cesium.PostProcessStageLibrary.createNightVisionStage();
  v.scene.postProcessStages.add(stage);
  stages.push(stage);
  statusText.value = "夜视（createNightVisionStage）：绿光增强";
}

function applyBw() {
  activeFeature.value = "bw";
  removeAll();
  const v = viewer.value;
  if (!v) return;
  const stage = Cesium.PostProcessStageLibrary.createBlackAndWhiteStage();
  v.scene.postProcessStages.add(stage);
  stages.push(stage);
  statusText.value = "黑白（createBlackAndWhiteStage）";
}

function applyCustom() {
  activeFeature.value = "custom";
  removeAll();
  const v = viewer.value;
  if (!v) return;
  // 自定义着色器：像素化 + 灰度
  // 1.145：PostProcessStage 走 GLSL 3.00，用 in 替代 varying，
  // texture() 替代 texture2D()；out_FragColor 由框架自动声明，无需手动写
  const stage = new Cesium.PostProcessStage({
    fragmentShader: `
      in vec2 v_textureCoordinates;
      uniform sampler2D colorTexture;
      void main() {
        float pixelSize = 5.0;
        vec2 dxy = pixelSize / czm_viewport.zw;
        vec2 uv = floor(v_textureCoordinates / dxy) * dxy + dxy * 0.5;
        vec4 color = texture(colorTexture, uv);
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        out_FragColor = vec4(vec3(gray), color.a);
      }
    `,
  });
  v.scene.postProcessStages.add(stage);
  stages.push(stage);
  statusText.value = "自定义着色器：像素化 + 灰度";
}

function applyClear() {
  activeFeature.value = "blur";
  removeAll();
  statusText.value = "已清除后期处理";
}

const codeMap: Record<string, () => string> = {
  blur: () => `// ① 内置库：高斯模糊
const stage =
  Cesium.PostProcessStageLibrary.createBlurStage()
viewer.scene.postProcessStages.add(stage)
// 移除：
// viewer.scene.postProcessStages.remove(stage)`,

  edge: () => `// ② 边缘检测 + 轮廓（串联两阶段）
const edge =
  Cesium.PostProcessStageLibrary
    .createEdgeDetectionStage()
const silhouette =
  Cesium.PostProcessStageLibrary
    .createSilhouetteStage()
silhouette.uniforms.color = Cesium.Color.LIME
viewer.scene.postProcessStages.add(edge)
viewer.scene.postProcessStages.add(silhouette)`,

  night: () => `// ③ 夜视滤镜
const stage =
  Cesium.PostProcessStageLibrary
    .createNightVisionStage()
viewer.scene.postProcessStages.add(stage)`,

  bw: () => `// ④ 黑白滤镜
const stage =
  Cesium.PostProcessStageLibrary
    .createBlackAndWhiteStage()
viewer.scene.postProcessStages.add(stage)`,

  custom: () => `// ⑤ 自定义全屏着色器（GLSL 3.00）
// 1.145：用 in 替代 varying，texture() 替代 texture2D()；
// out_FragColor 由框架自动声明，无需手动写
const stage = new Cesium.PostProcessStage({
  fragmentShader: \`
    in vec2 v_textureCoordinates;
    uniform sampler2D colorTexture;
    void main() {
      // 像素化
      float pixelSize = 5.0;
      vec2 dxy = pixelSize / czm_viewport.zw;
      vec2 uv = floor(v_textureCoordinates / dxy) * dxy + dxy * 0.5;
      // 灰度
      vec4 color = texture(colorTexture, uv);
      float gray = dot(color.rgb, vec3(0.299,0.587,0.114));
      out_FragColor = vec4(vec3(gray), color.a);
    }\`,
})
viewer.scene.postProcessStages.add(stage)`,
};

const explainMap: Record<string, () => string> = {
  blur: () => `【原理】后处理 = 把整帧渲染结果作为纹理，再过一遍像素着色器。
PostProcessStageLibrary 内置常用滤镜工厂：
createBlurStage / createEdgeDetectionStage / createSilhouetteStage /
createNightVisionStage / createBlackAndWhiteStage /
createBrightnessStage / createLensFlareStage / createDepthOfFieldStage…`,

  edge: () => `【原理】轮廓描边是两阶段：
① 边缘检测：用 Sobel 等算子求深度/法线梯度 → 边缘 mask
② Silhouette：按 mask 对边缘像素着色
两阶段用 postProcessStages.add 的顺序串联。

【要点】color uniform 控制描边颜色；
输出是“描边高亮 + 原画面”叠加。`,

  night: () => `【原理】夜视滤镜把画面映射为高对比的绿色调，
模拟夜视仪。属于“查打一体/安防”场景的典型效果。`,

  bw: () => `【原理】黑白滤镜 = 亮度加权求和（Rec.601 系数）。
同族还有 createBrightnessStage（亮度调整）等。`,

  custom: () => `【原理】自定义阶段核心是 fragmentShader（GLSL 3.00）：
• in vec2 v_textureCoordinates：UV 坐标（需手动声明，顶点着色器传递）
• uniform sampler2D colorTexture：上一阶段输出（需手动声明）
• out_FragColor：输出颜色（框架自动声明，直接赋值即可）
• czm_viewport：内置 uniform（像素尺寸等）
• texture()：GLSL 3.00 采样函数，替代 texture2D()
任何画面效果（景深、模糊、锐化、HDR 调色）都可以用 GLSL 实现。

【要点】1.145 起 PostProcessStage 走 GLSL 3.00，禁止用 varying 关键字；
需手动声明 in/uniform 变量，但 out_FragColor 不用声明；多阶段按添加顺序执行。`,
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
        :type="activeFeature === 'blur' ? 'primary' : 'default'"
        @click="applyBlur"
        >高斯模糊</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'edge' ? 'primary' : 'default'"
        @click="applyEdge"
        >轮廓描边</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'night' ? 'primary' : 'default'"
        @click="applyNight"
        >夜视</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'bw' ? 'primary' : 'default'"
        @click="applyBw"
        >黑白</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'custom' ? 'primary' : 'default'"
        @click="applyCustom"
        >自定义像素化</n-button
      >
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="postprocess-split"
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
