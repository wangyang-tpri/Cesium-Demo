<script setup lang="ts">
import { ref, provide, onBeforeUnmount, watch, nextTick } from "vue";
import * as Cesium from "cesium";
import SplitViewer from "@/components/base/SplitViewer.vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-img",
  camera: { position: [108.94, 34.2, 30000], pitch: -55 },
});

type AnnotationType = "text" | "icon" | "point-label";
const activeFeature = ref<AnnotationType | "clear" | null>(null);
const statusText = ref("标注工具：选择标注类型，在地图上点击添加标注。");

interface AnnotationItem {
  id: number;
  type: AnnotationType;
  text: string;
  entity: Cesium.Entity;
}

const annotationItems = ref<AnnotationItem[]>([]);
let annoIdCounter = 0;
let adding = false;
let currentType: AnnotationType | null = null;
let handler: Cesium.ScreenSpaceEventHandler | null = null;
let nativeClickListener: ((e: MouseEvent) => void) | null = null;

// 编辑标注
const showEditModal = ref(false);
const editingItem = ref<AnnotationItem | null>(null);
const editText = ref("");

// 标注样式设置
const annotationText = ref("新建标注");
const fontSize = ref(14);
const fontColor = ref("#ffffff");
const bgColor = ref("#1890ff");
const iconEmoji = ref("📍");

const annoTypes = [
  { key: "text" as AnnotationType, label: "文字标注", icon: "📝" },
  { key: "icon" as AnnotationType, label: "图标标注", icon: "🎯" },
  { key: "point-label" as AnnotationType, label: "点+标签", icon: "🔖" },
];

function selectType(type: AnnotationType) {
  stopAdding();
  currentType = type;
  activeFeature.value = type;
  startAdding();
  const names: Record<AnnotationType, string> = {
    text: "文字标注",
    icon: "图标标注",
    "point-label": "点+标签",
  };
  statusText.value = `已选择「${names[type]}」，点击地图添加标注。`;
}

function startAdding() {
  const v = viewer.value;
  if (!v || !v.scene || !v.scene.canvas) {
    statusText.value = "地图初始化中，请稍候再试...";
    return;
  }
  adding = true;
  // 先移除旧的监听器，避免重复绑定
  if (nativeClickListener) {
    v.scene.canvas.removeEventListener("click", nativeClickListener);
    nativeClickListener = null;
  }

  nativeClickListener = (e: MouseEvent) => {
    const canvas = v.scene.canvas;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const windowPos = new Cesium.Cartesian2(x, y);

    // 先检查是否点击到了已有标注 entity，如果是则打开编辑
    const picked = v.scene.pick(windowPos);
    if (picked && picked.id) {
      // 兼容 Cesium 不同版本：picked.id 可能是 Entity 或包含 id 的对象
      const pickedEntity =
        picked.id instanceof Cesium.Entity ? picked.id : (picked.id as any).id;
      if (pickedEntity) {
        const clickedItem = annotationItems.value.find(
          (item) => item.entity === pickedEntity
        );
        if (clickedItem) {
          openEditModal(clickedItem);
          return;
        }
      }
    }

    // 否则添加新标注
    const ray = v.camera.getPickRay(windowPos);
    if (!ray) return;
    const cartesian = v.scene.globe.pick(ray, v.scene);
    if (!cartesian) return;
    addAnnotation(cartesian);
  };
  v.scene.canvas.addEventListener("click", nativeClickListener);
}

// viewer 可能被多次创建/销毁（如 SplitViewer 容器变化），需要重新绑定事件
watch(
  () => viewer.value,
  (newV, oldV) => {
    // viewer 被销毁时，移除旧监听器
    if (!newV && oldV) {
      if (nativeClickListener && oldV.scene?.canvas) {
        oldV.scene.canvas.removeEventListener("click", nativeClickListener);
        nativeClickListener = null;
      }
    }
    // viewer 就绪且处于添加模式时，重新绑定事件
    if (newV && adding) {
      nextTick(() => startAdding());
    }
  },
  { immediate: true }
);

function stopAdding() {
  adding = false;
  if (handler) {
    handler.destroy();
    handler = null;
  }
  const v = viewer.value;
  if (v && v.scene && v.scene.canvas && nativeClickListener) {
    v.scene.canvas.removeEventListener("click", nativeClickListener);
    nativeClickListener = null;
  }
}

function addAnnotation(position: Cesium.Cartesian3) {
  const v = viewer.value;
  if (!v || !currentType) return;
  const id = ++annoIdCounter;
  let entity: Cesium.Entity;
  let name = "";

  if (currentType === "text") {
    name = `文字${id}`;
    entity = v.entities.add({
      position,
      label: {
        text: annotationText.value || name,
        font: `${fontSize.value}px sans-serif`,
        fillColor: Cesium.Color.fromCssColorString(fontColor.value),
        backgroundColor: Cesium.Color.fromCssColorString(
          bgColor.value
        ).withAlpha(0.85),
        showBackground: true,
        style: Cesium.LabelStyle.FILL,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
      },
    });
  } else if (currentType === "icon") {
    name = `图标${id}`;
    entity = v.entities.add({
      position,
      label: {
        text: iconEmoji.value,
        font: `${fontSize.value + 10}px sans-serif`,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
      },
    });
  } else {
    name = `点标${id}`;
    entity = v.entities.add({
      position,
      point: {
        pixelSize: 10,
        color: Cesium.Color.RED,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: annotationText.value || name,
        font: `${fontSize.value}px sans-serif`,
        pixelOffset: new Cesium.Cartesian2(0, -22),
        fillColor: Cesium.Color.fromCssColorString(fontColor.value),
        backgroundColor: Cesium.Color.fromCssColorString(
          bgColor.value
        ).withAlpha(0.85),
        showBackground: true,
        style: Cesium.LabelStyle.FILL,
      },
    });
  }

  annotationItems.value.push({
    id,
    type: currentType,
    text: annotationText.value,
    entity,
  });
  statusText.value = `已添加${name}`;
}

function applyClear() {
  activeFeature.value = "clear";
  stopAdding();
  if (handler) {
    handler.destroy();
    handler = null;
  }
  const v = viewer.value;
  if (v) {
    annotationItems.value.forEach((item) => v.entities.remove(item.entity));
  }
  annotationItems.value = [];
  annoIdCounter = 0;
  statusText.value = "已清除所有标注，选择类型重新添加。";
}

function removeItem(item: AnnotationItem) {
  const v = viewer.value;
  if (v) v.entities.remove(item.entity);
  annotationItems.value = annotationItems.value.filter((i) => i.id !== item.id);
  statusText.value = `已删除标注 #${item.id}`;
}

function flyToItem(item: AnnotationItem) {
  const v = viewer.value;
  if (!v) return;
  const pos = item.entity.position?.getValue(v.clock.currentTime);
  if (!pos) return;
  const carto = Cesium.Cartographic.fromCartesian(pos);
  v.camera.flyTo({
    destination: Cesium.Cartesian3.fromRadians(
      carto.longitude,
      carto.latitude,
      5000
    ),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-45),
      roll: 0,
    },
    duration: 1.5,
  });
}

function openEditModal(item: AnnotationItem) {
  editingItem.value = item;
  editText.value = item.text;
  showEditModal.value = true;
}

function saveEdit() {
  if (!editingItem.value) return;
  const item = editingItem.value;
  item.text = editText.value;
  // 更新 entity 的 label 文字
  if (item.entity.label) {
    (item.entity.label as any).text = editText.value;
  }
  showEditModal.value = false;
  editingItem.value = null;
  statusText.value = `已更新标注 #${item.id} 的文字`;
}

function cancelEdit() {
  showEditModal.value = false;
  editingItem.value = null;
}

onBeforeUnmount(() => {
  stopAdding();
  if (handler) handler.destroy();
  const v = viewer.value;
  if (v) {
    annotationItems.value.forEach((item) => v.entities.remove(item.entity));
  }
});

const codeMap: Record<AnnotationType | "clear", () => string> = {
  text: () => `// 文字标注
viewer.entities.add({
  position: cartesian,
  label: {
    text: '标注文字',
    font: '14px sans-serif',
    fillColor: Color.WHITE,
    backgroundColor: Color.fromCssColorString('#1890ff').withAlpha(0.85),
    showBackground: true,
    padding: new Cartesian2(10, 6),
    style: LabelStyle.FILL,
    verticalOrigin: VerticalOrigin.CENTER,
  },
});`,
  icon: () => `// 图标标注（使用 emoji 作为图标）
viewer.entities.add({
  position: cartesian,
  label: {
    text: '📍',
    font: '24px sans-serif',
    verticalOrigin: VerticalOrigin.CENTER,
  },
});

// 也可以使用 billboard 加载图片图标
viewer.entities.add({
  position: cartesian,
  billboard: {
    image: 'icon.png',
    width: 32, height: 32,
    verticalOrigin: VerticalOrigin.BOTTOM,
  },
});`,
  "point-label": () => `// 点+标签组合标注
viewer.entities.add({
  position: cartesian,
  point: {
    pixelSize: 10,
    color: Color.RED,
    outlineColor: Color.WHITE,
    outlineWidth: 2,
  },
  label: {
    text: '标签文字',
    font: '14px sans-serif',
    pixelOffset: new Cartesian2(0, -22),
    fillColor: Color.WHITE,
    backgroundColor: Color.fromCssColorString('#1890ff').withAlpha(0.85),
    showBackground: true,
    padding: new Cartesian2(8, 4),
  },
});`,
  clear: () => `// 清除所有标注
annotationItems.forEach(item => viewer.entities.remove(item.entity));
annotationItems = [];
if (handler) { handler.destroy(); handler = null; }`,
};

const explainMap: Record<AnnotationType | "clear", () => string> = {
  text: () => `【原理】文字标注 = label 实体 + 背景样式：
1. 使用 Entity.label 添加文字标注
2. text 设置标注内容，font 设置字体大小和样式
3. fillColor 文字颜色，backgroundColor + showBackground 背景色
4. padding 内边距，style 文字样式（FILL/OUTLINE/FILL_AND_OUTLINE）
5. verticalOrigin 垂直对齐方式

【API】
• Entity.label: 标签实体
• LabelStyle: 标签样式枚举
• VerticalOrigin: 垂直对齐枚举`,
  icon: () => `【原理】图标标注 = emoji label 或 billboard 图片：
1. 简单方式：使用 label 的 text 属性设置 emoji 字符作为图标
2. 专业方式：使用 billboard 加载外部图片资源
3. billboard 支持 width/height 缩放、verticalOrigin 对齐
4. emoji 方式无需额外资源，billboard 方式支持自定义图标

【API】
• Entity.label: 标签实体（emoji 方式）
• Entity.billboard: 广告牌实体（图片方式）
• billboard.image: 图片URL或Canvas`,
  "point-label": () => `【原理】点+标签 = point 实体 + label 实体组合：
1. point 实体在地图上绘制标记点
2. label 实体在点的上方显示文字标签
3. pixelOffset 控制标签相对于点的偏移量（y负值向上偏移）
4. 两者共享同一个 position，自动跟随点移动

【API】
• Entity.point: 点实体
• Entity.label: 标签实体
• pixelOffset: 像素偏移量（Cartesian2）`,
  clear: () => `【原理】清除 = 批量移除实体 + 销毁事件处理器：
1. 遍历 annotationItems，逐个移除实体
2. 重置计数器和列表
3. 销毁 ScreenSpaceEventHandler

【要点】清除操作不可撤销。`,
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
        v-for="t in annoTypes"
        :key="t.key"
        size="small"
        :type="activeFeature === t.key ? 'primary' : 'default'"
        @click="selectType(t.key)"
      >
        {{ t.icon }} {{ t.label }}
      </n-button>
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <!-- 样式设置 -->
    <div
      class="flex flex-wrap items-center gap-4 rounded border border-gray-200 bg-gray-50 px-4 py-2 text-xs"
    >
      <div class="flex items-center gap-2">
        <span class="text-gray-600">文字:</span>
        <n-input
          v-model:value="annotationText"
          size="small"
          placeholder="标注文字"
          style="width: 120px"
        />
      </div>
      <div class="flex items-center gap-2">
        <span class="text-gray-600">字号:</span>
        <n-input-number
          v-model:value="fontSize"
          size="small"
          :min="10"
          :max="32"
          style="width: 100px"
        />
      </div>
      <div class="flex items-center gap-2">
        <span class="text-gray-600">字色:</span>
        <n-color-picker
          v-model:value="fontColor"
          size="small"
          :modes="['hex']"
          style="width: 100px"
        />
      </div>
      <div class="flex items-center gap-2">
        <span class="text-gray-600">背景:</span>
        <n-color-picker
          v-model:value="bgColor"
          size="small"
          :modes="['hex']"
          style="width: 100px"
        />
      </div>
      <div v-if="activeFeature === 'icon'" class="flex items-center gap-2">
        <span class="text-gray-600">图标:</span>
        <n-input
          v-model:value="iconEmoji"
          size="small"
          placeholder="emoji"
          style="width: 100px"
        />
      </div>
    </div>

    <SplitViewer
      :title="activeFeature ?? ''"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="annotation-split"
    >
      <template #scene-overlay>
        <div
          class="absolute left-3 top-3 z-10 max-w-[70%] rounded bg-black/60 px-3 py-1.5 text-xs text-white"
        >
          {{ statusText }}
        </div>
      </template>

      <template #bottom-panel>
        <div class="border-t border-gray-200 bg-gray-50 p-4">
          <div class="mb-2 flex items-center justify-between">
            <div class="text-sm font-semibold text-gray-700">标注列表</div>
            <div class="text-xs text-gray-500">
              共 <b class="text-blue-600">{{ annotationItems.length }}</b> 个
            </div>
          </div>
          <div
            v-if="annotationItems.length === 0"
            class="py-4 text-center text-xs text-gray-400"
          >
            选择标注类型后在地图上点击添加
          </div>
          <div v-else class="flex max-h-32 flex-wrap gap-2 overflow-auto">
            <div
              v-for="item in annotationItems"
              :key="item.id"
              class="flex items-center gap-2 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs"
            >
              <span class="font-medium text-gray-700"
                >#{{ item.id }} {{ item.text || "(无文字)" }}</span
              >
              <n-button
                size="tiny"
                type="primary"
                quaternary
                @click="flyToItem(item)"
                >定位</n-button
              >
              <n-button
                size="tiny"
                type="error"
                quaternary
                @click="removeItem(item)"
                >删除</n-button
              >
            </div>
          </div>
        </div>
      </template>
    </SplitViewer>

    <!-- 编辑标注对话框 -->
    <n-modal
      v-model:show="showEditModal"
      preset="dialog"
      title="编辑标注文字"
      :show-icon="false"
      positive-text="保存"
      negative-text="取消"
      @positive-click="saveEdit"
      @negative-click="cancelEdit"
    >
      <div class="py-2">
        <n-input
          v-model:value="editText"
          placeholder="请输入标注文字"
          @keyup.enter="saveEdit"
        />
        <div class="mt-2 text-xs text-gray-400">
          提示：点击地图上的标注文字可快速编辑
        </div>
      </div>
    </n-modal>
  </div>
</template>
