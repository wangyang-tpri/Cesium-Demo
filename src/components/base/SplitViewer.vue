<script setup lang="ts">
import { inject, ref, type ComponentPublicInstance, type Ref } from "vue";
import CodePanel from "./CodePanel.vue";

const props = withDefaults(
  defineProps<{
    /** CodePanel 标题 */
    title: string;
    /** 代码 HTML（由 useCodeExplain 提供） */
    code: string;
    /** 原理讲解文本 */
    explanation: string;
    /** 默认左侧面板百分比，默认 70 */
    defaultSplitSize?: number;
    /** localStorage key，传入则持久化分割位置 */
    storageKey?: string;
  }>(),
  {
    defaultSplitSize: 70,
    storageKey: undefined,
  }
);

const emit = defineEmits<{
  /** 分割位置变化时触发，父组件可用于调用 viewer.resize() */
  (e: "split-change"): void;
}>();

// 通过 inject 获取父组件 provide 的 containerRef
const containerRef = inject<Ref<HTMLDivElement | null>>(
  "splitViewerContainerRef"
);

// 用函数 ref 方式更新父组件传入的 containerRef
// Vue 3.5+ 函数 ref 签名：(ref: Element | ComponentPublicInstance | null, refs: Record) => void
function setContainerRef(el: Element | ComponentPublicInstance | null) {
  if (containerRef && el instanceof Element) {
    containerRef.value = el as HTMLDivElement;
  }
}

// 从 localStorage 读取或使用默认值
const splitSize = ref<number>(props.defaultSplitSize);
</script>

<template>
  <div class="min-h-0 flex-1">
    <n-split
      direction="horizontal"
      :default-size="splitSize + '%'"
      :min="0.7"
      :max="0.85"
    >
      <template #1>
        <div
          class="relative h-full w-full overflow-hidden rounded-lg border border-gray-200 shadow-sm"
        >
          <div :ref="setContainerRef" class="h-full w-full"></div>
          <!-- 左侧场景覆盖层 slot：状态文本、工具栏、图例等 -->
          <slot name="scene-overlay"></slot>
        </div>
      </template>
      <template #2>
        <div class="h-full pl-3">
          <CodePanel :title="title" :code="code" :explanation="explanation" />
        </div>
      </template>
    </n-split>
  </div>
</template>
