<script setup lang="ts">
import * as Cesium from 'cesium';
import { ref, provide } from 'vue';
import { useCesiumViewer } from '@/hooks/useCesiumViewer';
import { useCodeExplain } from '@/hooks/useCodeExplain';
import SplitViewer from '@/components/base/SplitViewer.vue';

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref('load');
const statusText = ref('glTF 模型：加载、朝向、缩放与骨骼动画。');

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: 'esri',
  camera: { position: [108.94, 34.34, 1500], pitch: -40 },
});

// 分割条拖拽时通知 viewer 重新计算渲染尺寸
function onSplitChange() {
  viewer.value?.resize();
}

// 公开 glTF 示例模型（Khronos 官方 CesiumMan，jsdelivr CDN）
const CESIUM_MAN_URL =
  'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/CesiumMan/glTF-Binary/CesiumMan.glb';

const BASE_POS = Cesium.Cartesian3.fromDegrees(108.94, 34.34, 0);
// 站地点位（东-北-上 局部坐标系）
const BASE_MATRIX = Cesium.Transforms.eastNorthUpToFixedFrame(BASE_POS);

let model: Cesium.Model | null = null;
let activeAnimation: Cesium.ModelAnimation | null = null;
let entityModel: Cesium.Entity | null = null;
let animationSpeed = 1;
let animating = false;

function removeAll() {
  const v = viewer.value;
  if (!v) return;
  if (model) {
    v.scene.primitives.remove(model);
    model = null;
  }
  if (entityModel) {
    v.entities.remove(entityModel);
    entityModel = null;
  }
  activeAnimation = null;
}

async function applyLoad() {
  activeFeature.value = 'load';
  removeAll();
  const v = viewer.value;
  if (!v) return;
  statusText.value = '正在加载 CesiumMan 模型…';
  try {
    model = await Cesium.Model.fromGltfAsync({
      url: CESIUM_MAN_URL,
      modelMatrix: BASE_MATRIX,
      scale: 1,
    });
    v.scene.primitives.add(model);
    statusText.value = '模型已加载（Model.fromGltfAsync + scene.primitives）';
  } catch (e) {
    console.error(e);
    statusText.value = '加载失败：请检查网络';
  }
}

function applyEntityModel() {
  activeFeature.value = 'entity-model';
  removeAll();
  const v = viewer.value;
  if (!v) return;
  entityModel = v.entities.add({
    position: BASE_POS,
    orientation: Cesium.Transforms.headingPitchRollQuaternion(
      BASE_POS,
      new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(45), 0, 0)
    ),
    model: { uri: CESIUM_MAN_URL, scale: 1, silhouetteColor: Cesium.Color.YELLOW, silhouetteSize: 2 },
  });
  statusText.value = 'Entity.model 方式加载（自带拾取与信息）';
}

function applyAnimate() {
  activeFeature.value = 'animation';
  if (!model) {
    statusText.value = '请先加载模型';
    return;
  }
  if (!animating) {
    // 播放模型内置动画（CesiumMan 的行走动画）
    // 1.145：add 参数为 multiplier（倍速），不再有 speed；
    // 该 glb 的动画未命名（name 为 null），按名称 add 会抛
    // DeveloperError，因此用 index 定位。
    activeAnimation = model.activeAnimations.add({
      index: 0,
      multiplier: animationSpeed,
      loop: Cesium.ModelAnimationLoop.REPEAT,
    });
    animating = true;
    statusText.value = '▶ 行走动画播放中（activeAnimations.add, index: 0）';
  } else {
    // 1.145：ModelAnimation 无 stop()，改用集合 remove
    if (activeAnimation) model.activeAnimations.remove(activeAnimation);
    activeAnimation = null;
    animating = false;
    statusText.value = '⏸ 动画已暂停';
  }
}

function applySpeed() {
  activeFeature.value = 'animation';
  if (!model) return;
  animationSpeed = animationSpeed >= 3 ? 0.5 : animationSpeed + 0.5;
  // multiplier 为只读属性：移除后用新倍速重新加入
  if (activeAnimation) model.activeAnimations.remove(activeAnimation);
  activeAnimation = model.activeAnimations.add({
    index: 0,
    multiplier: animationSpeed,
    loop: Cesium.ModelAnimationLoop.REPEAT,
  });
  statusText.value = `动画速度：${animationSpeed}x`;
}

function applyScale() {
  activeFeature.value = 'scale';
  if (!model) {
    statusText.value = '请先加载模型';
    return;
  }
  model.scale = model.scale > 2 ? 1 : model.scale * 1.5;
  statusText.value = `模型缩放：${model.scale.toFixed(2)}x（model.scale）`;
}

let headingDeg = 0;
function applyRotate() {
  activeFeature.value = 'node';
  if (!model) {
    statusText.value = '请先加载模型';
    return;
  }
  headingDeg = (headingDeg + 30) % 360;
  // 用 HeadingPitchRoll 四元数 + 位置组合模型矩阵，实现绕本地垂直轴旋转
  model.modelMatrix = Cesium.Matrix4.fromTranslationQuaternionRotationScale(
    BASE_POS,
    Cesium.Transforms.headingPitchRollQuaternion(
      BASE_POS,
      new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(headingDeg), 0, 0)
    ),
    new Cesium.Cartesian3(1, 1, 1)
  );
  statusText.value = `朝向已旋转：heading ${headingDeg}°（modelMatrix + 四元数）`;
}

function applyClear() {
  activeFeature.value = 'load';
  removeAll();
  animating = false;
  statusText.value = '已清除模型';
}

const codeMap: Record<string, () => string> = {
  load: () => `// ① Model.fromGltfAsync：加载 glTF/glb 模型
const model = await Cesium.Model.fromGltfAsync({
  url: 'https://.../CesiumMan.glb',
  modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(
    Cesium.Cartesian3.fromDegrees(108.94, 34.34, 0)
  ),
  scale: 1,
  color: Cesium.Color.WHITE,  // 可整体染色
})
viewer.scene.primitives.add(model)`,

  'entity-model': () => `// ② Entity.model：声明式加载（推荐日常使用）
viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
  orientation: Cesium.Transforms.headingPitchRollQuaternion(
    position,
    new Cesium.HeadingPitchRoll(
      Cesium.Math.toRadians(45), 0, 0)),
  model: {
    uri: 'https://.../CesiumMan.glb',
    scale: 1,
    silhouetteColor: Cesium.Color.YELLOW, // 描边
    silhouetteSize: 2,
  },
})`,

  animation: () => `// ③ 骨骼动画控制
// 播放（循环）：
const anim = model.activeAnimations.add({
  index: 0,         // 按序号定位动画（1.145 支持 name 或 index）
  multiplier: 1,    // 倍速（1.145 取代旧版 speed）
  loop: Cesium.ModelAnimationLoop.REPEAT,
})
// 调速：multiplier 只读 → 移除后重新 add
model.activeAnimations.remove(anim)
model.activeAnimations.add({
  index: 0, multiplier: 2,
  loop: Cesium.ModelAnimationLoop.REPEAT,
})
// 动画未命名时按 name 会抛错：优先用 index，或 addAll() 播放全部`,

  scale: () => `// ④ 缩放（沿模型局部轴）
model.scale = 1.5
// 精细控制可操作节点：
const node = model.getNode('Armature')
node.scale = new Cesium.Cartesian3(1, 1, 1.5)`,

  node: () => `// ⑤ 位置与朝向（modelMatrix 变换）
model.modelMatrix = Cesium.Matrix4.multiply(
  Cesium.Transforms.eastNorthUpToFixedFrame(pos),   // 站位
  rotationMatrix,                                    // 旋转
  new Cesium.Matrix4())
// ★ 移动模型用 Transforms 系列工具最方便`,
};

const explainMap: Record<string, () => string> = {
  load: () => `【原理】Model 是 Cesium 的 glTF 2.0 运行时：
• 解析 glTF（几何/材质/动画/节点）
• 自动生成 PBR 材质与法线/切线
• 支持 Draco 压缩、纹理等扩展

【要点】glb 为二进制单文件，加载最快；
模型本地资源或 CDN 均可，注意 CORS。`,

  'entity-model': () => `【原理】Entity.model 是 Model 的声明式包装：
自动处理位置/朝向（orientation）、拾取、信息框，并随数据源管理生命周期。

【区别】
• scene.primitives + Model：底层控制（动画/节点/样式），性能优先
• Entity.model：开发效率高，交互完善
• 本页两种方式都演示了，可切换对比`,

  animation: () => `【原理】glTF 动画基于节点变换关键帧（线性/样条插值）。
model.activeAnimations 管理正在播放的动画：
• add({ name | index, multiplier, loop }) 启动
• REPEAT 循环 / MIRRORED_REPEAT 往复 / STOP 单次

【要点】动画按 name 或 index 定位；许多模型（如本页
CesiumMan）动画未命名，必须用 index（或 addAll()）。`,

  scale: () => `【原理】model.scale 对整个模型做均匀缩放；
更精细的需求可用 getNode() 获取骨骼/网格节点，
对节点做位移/旋转/缩放（局部变换）。

【要点】节点变换影响其子级（骨骼层级结构）。`,

  node: () => `【原理】modelMatrix 是模型在场景中的世界变换矩阵。
Transforms.eastNorthUpToFixedFrame 把经纬度坐标转成
“东-北-上”局部坐标系 → 模型底边贴地、朝向可控。

【要点】Entity 场景用 orientation（四元数）更方便；
Primitive 场景用 modelMatrix 组合任意变换。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" :type="activeFeature === 'load' ? 'primary' : 'default'" @click="applyLoad">加载模型</n-button>
      <n-button size="small" :type="activeFeature === 'entity-model' ? 'primary' : 'default'" @click="applyEntityModel">Entity 方式</n-button>
      <n-button size="small" :type="activeFeature === 'animation' ? 'primary' : 'default'" @click="applyAnimate">{{ animating ? '暂停动画' : '播放动画' }}</n-button>
      <n-button size="small" :type="activeFeature === 'animation' ? 'primary' : 'default'" @click="applySpeed">速度 {{ animationSpeed }}x</n-button>
      <n-button size="small" :type="activeFeature === 'scale' ? 'primary' : 'default'" @click="applyScale">缩放</n-button>
      <n-button size="small" :type="activeFeature === 'node' ? 'primary' : 'default'" @click="applyRotate">旋转朝向</n-button>
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="model-split"
      @split-change="onSplitChange"
    >
      <template #scene-overlay>
        <div class="absolute left-3 top-3 z-10 rounded bg-black/60 px-3 py-1.5 text-xs text-white">{{ statusText }}</div>
      </template>
    </SplitViewer>
  </div>
</template>
