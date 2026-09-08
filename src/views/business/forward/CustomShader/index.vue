<script setup lang="ts">
import * as Cesium from 'cesium';
import { ref } from 'vue';
import { useCesiumViewer } from '@/hooks/useCesiumViewer';
import { useCodeExplain } from '@/hooks/useCodeExplain';
import CodePanel from '@/components/base/CodePanel.vue';

const containerRef = ref<HTMLDivElement | null>(null);
const activeFeature = ref('color');
const statusText = ref('CustomShader：为 glTF 模型注入自定义 GLSL，实时控制渲染。');

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: 'esri',
  camera: { position: [108.94, 34.34, 1200], pitch: -35 },
});

const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/CesiumMan/glTF-Binary/CesiumMan.glb';

const BASE_POS = Cesium.Cartesian3.fromDegrees(108.94, 34.34, 0);
const BASE_MATRIX = Cesium.Transforms.eastNorthUpToFixedFrame(BASE_POS);

let model: Cesium.Model | null = null;
let shader: Cesium.CustomShader | null = null;

async function ensureModel(): Promise<boolean> {
  const v = viewer.value;
  if (!v) return false;
  if (model) return true;
  statusText.value = '正在加载模型…';
  try {
    model = await Cesium.Model.fromGltfAsync({ url: MODEL_URL, modelMatrix: BASE_MATRIX });
    v.scene.primitives.add(model);
    return true;
  } catch (e) {
    console.error(e);
    statusText.value = '模型加载失败：请检查网络';
    return false;
  }
}

function applyShader(name: string, s: Cesium.CustomShader) {
  shader = s;
  if (model) model.customShader = shader;
  activeFeature.value = name;
}

async function applyColor() {
  if (!(await ensureModel())) return;
  applyShader(
    'color',
    new Cesium.CustomShader({
      uniforms: {
        u_color: { type: Cesium.UniformType.VEC3, value: new Cesium.Cartesian3(1.0, 0.35, 0.2) },
      },
      fragmentShaderText: `
        void fragmentMain(FragmentInput fsInput,
                          inout czm_modelMaterial material) {
          material.diffuse = u_color;      // 覆盖漫反射颜色
          material.alpha = 1.0;
        }
      `,
    })
  );
  statusText.value = '整体变色：uniform u_color 覆盖材质漫反射';
}

async function applyGradient() {
  if (!(await ensureModel())) return;
  applyShader(
    'gradient',
    new Cesium.CustomShader({
      fragmentShaderText: `
        void fragmentMain(FragmentInput fsInput,
                          inout czm_modelMaterial material) {
          // 按模型局部 Y（身高方向）渐变
          float h = clamp(v_positionMC.y * 0.8 + 0.5, 0.0, 1.0);
          vec3 bottom = vec3(0.05, 0.3, 0.9);   // 蓝
          vec3 top    = vec3(1.0, 0.4, 0.0);    // 橙
          material.diffuse = mix(bottom, top, h);
        }
      `,
    })
  );
  statusText.value = '高度渐变：v_positionMC.y 从蓝到橙渐变';
}

async function applyWave() {
  if (!(await ensureModel())) return;
  applyShader(
    'wave',
    new Cesium.CustomShader({
      vertexShaderText: `
        void vertexMain(VertexInput vsInput,
                        inout czm_modelVertexOutput vsOutput) {
          // 基于内置帧号做时间波动（每帧自增）
          float t = float(czm_frameNumber) / 60.0;
          float wave = sin(vsInput.attributes.positionMC.x * 4.0 + t * 3.0)
                       * 0.15 * vsInput.attributes.positionMC.y;
          vsOutput.positionMC.z += wave;      // 顶点在 Z 方向起伏
        }
      `,
    })
  );
  statusText.value = '顶点波动：sin 波扰动顶点位置（vertexMain）';
}

async function applyClip() {
  if (!(await ensureModel())) return;
  applyShader(
    'clip',
    new Cesium.CustomShader({
      fragmentShaderText: `
        void fragmentMain(FragmentInput fsInput,
                          inout czm_modelMaterial material) {
          // 裁剪模型上半身（局部坐标 Y > 0.3 的片段丢弃）
          if (v_positionMC.y > 0.3) {
            discard;
          }
          material.diffuse = vec3(0.2, 0.9, 0.6);
        }
      `,
    })
  );
  statusText.value = '剖面裁剪：Y>0.3 片段 discard（局部坐标）';
}

function applyReset() {
  activeFeature.value = 'color';
  // 1.145：customShader 为必填属性，不能赋 undefined；
  // 恢复默认材质改为直接销毁重建模型（着色器随之清除）
  if (model) {
    const v = viewer.value;
    if (v) v.scene.primitives.remove(model);
    model = null;
  }
  shader = null;
  statusText.value = '已恢复默认材质（重建模型，无自定义着色器）';
}

const codeMap: Record<string, () => string> = {
  color: () => `// ① 整体变色
const shader = new Cesium.CustomShader({
  uniforms: {
    u_color: {
      type: Cesium.UniformType.VEC3,
      value: new Cesium.Cartesian3(1.0, 0.35, 0.2),
    },
  },
  fragmentShaderText: \`
    void fragmentMain(FragmentInput fsInput,
                      inout czm_modelMaterial material) {
      material.diffuse = u_color;
    }\`,
})
model.customShader = shader`,

  gradient: () => `// ② 高度渐变：内置 varying
fragmentShaderText: \`
  void fragmentMain(FragmentInput fsInput,
                    inout czm_modelMaterial material) {
    // v_positionMC：模型局部坐标
    float h = clamp(v_positionMC.y * 0.8 + 0.5, 0.0, 1.0);
    material.diffuse = mix(
      vec3(0.05, 0.3, 0.9),   // 底部蓝
      vec3(1.0, 0.4, 0.0),    // 顶部橙
      h);
  }\``,

  wave: () => `// ③ 顶点波动：vertexMain 改写顶点位置
vertexShaderText: \`
  void vertexMain(VertexInput vsInput,
                  inout czm_modelVertexOutput vsOutput) {
    float t = float(czm_frameNumber) / 60.0;  // 内置帧号=时间
    float wave = sin(
      vsInput.attributes.positionMC.x * 4.0 + t * 3.0)
      * 0.15 * vsInput.attributes.positionMC.y;
    vsOutput.positionMC.z += wave;
  }\``,

  clip: () => `// ④ 剖面裁剪：discard 片段
fragmentShaderText: \`
  void fragmentMain(FragmentInput fsInput,
                    inout czm_modelMaterial material) {
    if (v_positionMC.y > 0.3) {
      discard;              // 丢弃片段（显示为镂空）
    }
    material.diffuse = vec3(0.2, 0.9, 0.6);
  }\``,
};

const explainMap: Record<string, () => string> = {
  color: () => `【原理】CustomShader 是 1.95+ 提供的 glTF 材质/顶点可编程入口：
• uniforms：用户自定义 uniform（支持 setUniform 运行中修改）
• vertexShaderText / fragmentShaderText：注入的 GLSL 代码
• fragmentMain 中操作 czm_modelMaterial（diffuse/metallic/alpha 等）

【要点】不修改模型数据，GPU 端实时生效；可叠加使用。`,

  gradient: () => `【原理】系统自动提供常用 varying：
• v_positionMC：模型局部坐标
• v_positionEC：世界坐标
• v_normalMC / v_normalEC：法线
• texCoord_0：UV
用它们可实现高度渐变、水淹线、故障扫描等效果。

【要点】fragmentMain 里必须先 material 默认值再覆盖，或直接赋值目标属性。`,

  wave: () => `【原理】vertexMain 在顶点着色阶段修改顶点位置：
• czm_frameNumber：内置帧计数器（每帧 +1），可当“时间”
• vsInput.attributes.positionMC：顶点局部坐标（只读）
• vsOutput.positionMC：写出的顶点位置

【要点】顶点动画（旗帜飘扬、水面波动、模型形变）都走这个入口；
注意顶点数量多时开销上升。`,

  clip: () => `【原理】discard 丢弃当前片段 → 镂空效果。
配合 v_positionMC / 法线/属性可实现：
• 剖面（基坑开挖、楼层切割）
• 按属性显示/隐藏部件（如只显示管道层）
• 透视高亮（内部可见）

【要点】discard 不产生深度，镂空处可看到背后内容。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" :type="activeFeature === 'color' ? 'primary' : 'default'" @click="applyColor">整体变色</n-button>
      <n-button size="small" :type="activeFeature === 'gradient' ? 'primary' : 'default'" @click="applyGradient">高度渐变</n-button>
      <n-button size="small" :type="activeFeature === 'wave' ? 'primary' : 'default'" @click="applyWave">顶点波动</n-button>
      <n-button size="small" :type="activeFeature === 'clip' ? 'primary' : 'default'" @click="applyClip">剖面裁剪</n-button>
      <n-button size="small" quaternary @click="applyReset">恢复默认</n-button>
    </div>

    <div class="flex min-h-0 flex-1 gap-3">
      <div class="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-gray-200 shadow-sm">
        <div ref="containerRef" class="h-full w-full"></div>
        <div class="absolute left-3 top-3 z-10 rounded bg-black/60 px-3 py-1.5 text-xs text-white">{{ statusText }}</div>
      </div>
      <CodePanel :title="activeFeature" :code="code" :explanation="explanation" />
    </div>
  </div>
</template>
