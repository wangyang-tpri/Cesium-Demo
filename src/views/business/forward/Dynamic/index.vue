<script setup lang="ts">
import * as Cesium from "cesium";
import { ref, provide } from "vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";
import SplitViewer from "@/components/base/SplitViewer.vue";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref("glow-line");
const statusText = ref(
  "动态效果：基于 CallbackProperty 随时间变化的视觉表达。"
);

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-img",
  camera: { position: [108.94, 34.34, 16000], pitch: -55 },
  clock: {
    start: Cesium.JulianDate.fromIso8601("2026-01-01T00:00:00Z"),
    stop: Cesium.JulianDate.fromIso8601("2026-01-01T01:00:00Z"),
    currentTime: Cesium.JulianDate.fromIso8601("2026-01-01T00:00:00Z"),
    multiplier: 1,
    shouldAnimate: true,
    range: Cesium.ClockRange.LOOP_STOP,
  },
});

const entities: Cesium.Entity[] = [];
function clearAll() {
  const v = viewer.value;
  if (!v) return;
  for (const e of entities) v.entities.remove(e);
  entities.length = 0;
}

function seconds(time: Cesium.JulianDate | undefined): number {
  // 1.145：CallbackProperty 回调的 time 参数可选，需兜底
  return Cesium.JulianDate.secondsDifference(
    time ?? Cesium.JulianDate.now(),
    Cesium.JulianDate.fromIso8601("2026-01-01T00:00:00Z")
  );
}

/* ① 流动光点：一个光点沿路径循环运动 + 发光轨迹 */
function applyGlowLine() {
  activeFeature.value = "glow-line";
  clearAll();
  const v = viewer.value;
  if (!v) return;
  const path = Cesium.Cartesian3.fromDegreesArray([
    108.92, 34.33, 108.93, 34.33, 108.94, 34.335, 108.95, 34.34, 108.96, 34.335,
  ]);
  entities.push(
    v.entities.add({
      polyline: {
        positions: path,
        width: 5,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.3,
          color: Cesium.Color.fromCssColorString("#00d2ff"),
        }),
        clampToGround: true,
      },
    }),
    v.entities.add({
      // 光点沿路径运动
      // 1.145：Entity.position 需 PositionProperty，普通 CallbackProperty 需断言
      position: new Cesium.CallbackProperty((time) => {
        const t = (seconds(time) % 12) / 12; // 12 秒一圈
        const idx = t * (path.length - 1);
        const i = Math.floor(idx);
        const f = idx - i;
        const a = path[i]!;
        const b = path[Math.min(i + 1, path.length - 1)]!;
        return Cesium.Cartesian3.lerp(a, b, f, new Cesium.Cartesian3());
      }, false) as unknown as Cesium.PositionProperty,
      point: {
        pixelSize: 14,
        color: Cesium.Color.CYAN,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
    })
  );
  statusText.value = "动态光点：沿路径循环运动（CallbackProperty 每帧取值）";
}

/* ② 扩散波纹：半径随时间扩大、透明度衰减 */
function applyRipple() {
  activeFeature.value = "ripple";
  clearAll();
  const v = viewer.value;
  if (!v) return;
  entities.push(
    v.entities.add({
      position: Cesium.Cartesian3.fromDegrees(108.94, 34.34, 0),
      ellipse: {
        // 半径与透明度都由时间驱动
        semiMajorAxis: new Cesium.CallbackProperty((time) => {
          const t = seconds(time) % 4;
          return 200 + t * 900;
        }, false),
        semiMinorAxis: new Cesium.CallbackProperty((time) => {
          const t = seconds(time) % 4;
          return 200 + t * 900;
        }, false),
        // 1.145：material 需要 MaterialProperty，用 ColorMaterialProperty 包裹回调
        material: new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty((time) => {
            const t = (seconds(time) % 4) / 4;
            return Cesium.Color.fromCssColorString("#00e676").withAlpha(
              0.6 * (1 - t)
            );
          }, false)
        ),
        height: 0,
      },
    })
  );
  statusText.value =
    "扩散波纹：半径 4 秒一循环（CallbackProperty 驱动椭圆与透明度）";
}

/* ③ 动态箭头：沿路径整体流动的箭头线 */
function applyArrow() {
  activeFeature.value = "arrow";
  clearAll();
  const v = viewer.value;
  if (!v) return;
  const path = Cesium.Cartesian3.fromDegreesArray([
    108.9, 34.36, 108.92, 34.365, 108.94, 34.36, 108.96, 34.35, 108.98, 34.36,
  ]);
  entities.push(
    v.entities.add({
      polyline: {
        positions: path,
        width: 12,
        // 1.145：PolylineArrowMaterialProperty 直接接收颜色
        material: new Cesium.PolylineArrowMaterialProperty(
          Cesium.Color.fromCssColorString("#ff9f43")
        ),
        clampToGround: true,
      },
    }),
    // 箭头端点光晕（模拟“正在流动”的头部）
    v.entities.add({
      position: new Cesium.CallbackProperty((time) => {
        const t = (seconds(time) % 8) / 8;
        const idx = t * (path.length - 1);
        const i = Math.floor(idx);
        const f = idx - i;
        return Cesium.Cartesian3.lerp(
          path[i]!,
          path[Math.min(i + 1, path.length - 1)]!,
          f,
          new Cesium.Cartesian3()
        );
      }, false) as unknown as Cesium.PositionProperty,
      point: {
        pixelSize: 18,
        color: new Cesium.CallbackProperty((time) => {
          const f = (seconds(time) % 0.5) / 0.5;
          return Cesium.Color.fromCssColorString("#ffeaa7").withAlpha(
            1 - f * 0.7
          );
        }, false),
      },
    })
  );
  statusText.value = "动态箭头：方向箭头 + 流动头部光点";
}

/* ④ 扫描圈：条纹材质 + 旋转角度随时间变化 */
function applyScan() {
  activeFeature.value = "scan";
  clearAll();
  const v = viewer.value;
  if (!v) return;
  entities.push(
    v.entities.add({
      position: Cesium.Cartesian3.fromDegrees(108.94, 34.34, 0),
      ellipse: {
        semiMajorAxis: 1200,
        semiMinorAxis: 1200,
        stRotation: new Cesium.CallbackProperty((time) => {
          return ((seconds(time) * 40) % 360) * (Math.PI / 180); // 每秒转 40°
        }, false),
        material: new Cesium.StripeMaterialProperty({
          evenColor: Cesium.Color.fromCssColorString("#6c5ce7").withAlpha(0.85),
          oddColor: Cesium.Color.fromCssColorString("#0984e3").withAlpha(0.85),
          repeat: 8,
        }),
        height: 0,
      },
    })
  );
  statusText.value = "扫描圈：条纹圆盘以每秒 40° 旋转（stRotation 时间驱动）";
}

function applyClear() {
  activeFeature.value = "glow-line";
  clearAll();
  statusText.value = "已清除动态效果";
}

const codeMap: Record<string, () => string> = {
  "glow-line": () => `// ① 流动光点：位置随 time 插值
position: new Cesium.CallbackProperty((time) => {
  const t = (timeSec % 12) / 12       // 12秒一圈
  const idx = t * (path.length - 1)
  const i = Math.floor(idx)
  const f = idx - i
  return Cesium.Cartesian3.lerp(
    path[i], path[i + 1], f, new Cesium.Cartesian3())
}, false)
// ★ 第二个参数 false：不缓存结果（每次都求值）`,

  ripple: () => `// ② 扩散波纹：属性皆可随时间变化
semiMajorAxis: new Cesium.CallbackProperty((time) => {
  const t = timeSec % 4
  return 200 + t * 900          // 半径线性扩大
}, false),
// 1.145：材质类属性需 MaterialProperty 包装
material: new Cesium.ColorMaterialProperty(
  new Cesium.CallbackProperty((time) => {
    const f = (timeSec % 4) / 4
    return Color.GREEN.withAlpha(0.6 * (1 - f)) // 渐隐
  }, false))`,

  arrow: () => `// ③ 动态箭头线
polyline: {
  // 1.145：直接传颜色
  material: new Cesium.PolylineArrowMaterialProperty(
    Cesium.Color.fromCssColorString('#ff9f43')),
  width: 12,
}
// + 头部光点（同 ① 的插值做法）`,

  scan: () => `// ④ 扫描圈：stRotation 旋转
stRotation: new Cesium.CallbackProperty((time) => {
  return (timeSec * 40 % 360) * (Math.PI / 180)
}, false),
material: new Cesium.StripeMaterialProperty({
  evenColor: ...,
  oddColor: ...,
  repeat: 8,
})`,
};

const explainMap: Record<string, () => string> = {
  "glow-line": () => `【原理】CallbackProperty 是 Cesium 动态属性的基石：
任何期望“随时间变化”的属性（position/尺寸/颜色/旋转）都可以传入
一个 (time) => 值 的函数。渲染帧自动调用，天然与时钟同步。

【性能】第二个参数 false 表示每次调用都重新求值（默认 true 会缓存）。
高频变化的属性务必传 false；不变的函数传 true 可省计算。`,

  ripple:
    () => `【原理】波纹 = 半径扩展 + 透明度衰减两个 CallbackProperty 叠加。
比 Entity 动画（position 移动）更轻量：只更新 uniform/几何参数。

【要点】同一 time 函数的不同相位（% 4 与 /4）分别控制
形状与颜色的节奏，可做出“多层波纹”效果。`,

  arrow:
    () => `【原理】PolylineArrowMaterialProperty 把线渲染为连续箭头（表达流向），
配合头部光点（插值移动 + 闪烁 alpha）强化“流动感”。

【要点】箭头方向 = 线的走向；宽线 + 亮色效果更明显。`,

  scan: () => `【原理】ellipse.stRotation 控制纹理旋转角（弧度），
CallbackProperty 驱动后即得到“扫描雷达”效果。
StripeMaterialProperty 提供明暗条纹，旋转后视觉对比清晰。

【要点】stRotation 以弧度为步进，注意换算；可用于
雷达扫描、安全区扫描、覆盖范围指示等。`,
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
        :type="activeFeature === 'glow-line' ? 'primary' : 'default'"
        @click="applyGlowLine"
        >流动光点</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'ripple' ? 'primary' : 'default'"
        @click="applyRipple"
        >扩散波纹</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'arrow' ? 'primary' : 'default'"
        @click="applyArrow"
        >动态箭头</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'scan' ? 'primary' : 'default'"
        @click="applyScan"
        >扫描圈</n-button
      >
      <n-button size="small" quaternary @click="applyClear">清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="dynamic-split"
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
