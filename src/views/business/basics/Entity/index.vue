<script setup lang="ts">
import * as Cesium from "cesium";
import { ref, provide } from "vue";
import { useCesiumViewer } from "@/hooks/useCesiumViewer";
import { useCodeExplain } from "@/hooks/useCodeExplain";
import SplitViewer from "@/components/base/SplitViewer.vue";

const containerRef = ref<HTMLDivElement | null>(null);
provide("splitViewerContainerRef", containerRef);
const activeFeature = ref("point");
const statusText = ref("点击下方按钮，在场景中添加/移除各类实体。");

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: "tianditu-img",
  camera: { position: [108.945, 34.34, 14000], pitch: -50 },
});

// 分割条拖拽时通知 viewer 重新计算渲染尺寸
function onSplitChange() {
  viewer.value?.resize();
}

// 已添加的实体 id 集合，用于增删切换
const added = new Set<string>();
// feature -> 实体实际 id（Cesium.Entity.id 为只读，构造时自动生成 guid）
const idMap = new Map<string, string>();

function toggleEntity(feature: string, entity: Cesium.Entity) {
  const v = viewer.value;
  if (!v) return;
  if (added.has(feature)) {
    v.entities.removeById(idMap.get(feature)!);
    idMap.delete(feature);
    added.delete(feature);
    statusText.value = `已移除：${feature}`;
  } else {
    // 1.145：Entity.id 只读，不可在构造后赋值；构造时未传 id 会自动生成 guid
    v.entities.add(entity);
    idMap.set(feature, entity.id);
    added.add(feature);
    statusText.value = `已添加：${feature}（实体总数 ${v.entities.values.length}）`;
    // 飞行到该实体，方便查看
    v.flyTo(entity, {
      duration: 1.5,
      offset: new Cesium.HeadingPitchRange(
        0,
        Cesium.Math.toRadians(-45),
        2000
      ),
    });
  }
}

/* ============ 9 类实体 ============ */

function applyPoint() {
  activeFeature.value = "point";
  toggleEntity(
    "point",
    new Cesium.Entity({
      position: Cesium.Cartesian3.fromDegrees(108.94, 34.342, 0),
      point: {
        pixelSize: 12,
        color: Cesium.Color.RED,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
    })
  );
}

function applyLabel() {
  activeFeature.value = "label";
  toggleEntity(
    "label",
    new Cesium.Entity({
      position: Cesium.Cartesian3.fromDegrees(108.9435, 34.3425, 0),
      label: {
        text: "西安·钟楼",
        font: "16px Microsoft YaHei, sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString("#c0392b"),
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -30),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      },
    })
  );
}

function applyBillboard() {
  activeFeature.value = "billboard";
  toggleEntity(
    "billboard",
    new Cesium.Entity({
      position: Cesium.Cartesian3.fromDegrees(108.947, 34.341, 0),
      billboard: {
        // Cesium 内置 maki 图标（本地资源）
        image: Cesium.buildModuleUrl("Assets/Textures/maki/star.png"),
        scale: 1.4,
        color: Cesium.Color.YELLOW,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      },
    })
  );
}

function applyPolyline() {
  activeFeature.value = "polyline";
  toggleEntity(
    "polyline",
    new Cesium.Entity({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([
          108.94,
          34.342, // 钟楼
          108.945,
          34.341, // 南大街
          108.952,
          34.3395, // 南门
        ]),
        width: 6,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.35,
          color: Cesium.Color.CYAN,
        }),
        clampToGround: true,
      },
    })
  );
}

function applyPolygon() {
  activeFeature.value = "polygon";
  toggleEntity(
    "polygon",
    new Cesium.Entity({
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([
          108.955, 34.338, 108.962, 34.338, 108.962, 34.343, 108.955, 34.343,
        ]),
        material: Cesium.Color.fromCssColorString("#27ae60").withAlpha(0.5),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
        height: 0,
      },
    })
  );
}

function applyWall() {
  activeFeature.value = "wall";
  toggleEntity(
    "wall",
    new Cesium.Entity({
      wall: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          108.93, 34.336, 0, 108.934, 34.336, 0, 108.934, 34.34, 0, 108.93,
          34.34, 0,
        ]),
        maximumHeights: [80, 60, 80, 60],
        minimumHeights: [0, 0, 0, 0],
        material: Cesium.Color.fromCssColorString("#e67e22").withAlpha(0.7),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
      },
    })
  );
}

function applyBox() {
  activeFeature.value = "box";
  toggleEntity(
    "box",
    new Cesium.Entity({
      position: Cesium.Cartesian3.fromDegrees(108.922, 34.344, 100),
      box: {
        dimensions: new Cesium.Cartesian3(300, 200, 200), // 长宽高(米)
        material: Cesium.Color.fromCssColorString("#8e44ad").withAlpha(0.8),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
      },
    })
  );
}

function applyEllipsoid() {
  activeFeature.value = "ellipsoid";
  toggleEntity(
    "ellipsoid",
    new Cesium.Entity({
      position: Cesium.Cartesian3.fromDegrees(108.97, 34.218, 0), // 大雁塔
      ellipsoid: {
        radii: new Cesium.Cartesian3(300, 300, 200), // 三轴半径
        material: Cesium.Color.fromCssColorString("#3498db").withAlpha(0.45),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
      },
    })
  );
}

function applyCorridor() {
  activeFeature.value = "corridor";
  toggleEntity(
    "corridor",
    new Cesium.Entity({
      corridor: {
        positions: Cesium.Cartesian3.fromDegreesArray([
          108.92, 34.35, 108.928, 34.352, 108.936, 34.349,
        ]),
        width: 80, // 走廊宽度(米)
        cornerType: Cesium.CornerType.ROUNDED,
        material: Cesium.Color.fromCssColorString("#f1c40f").withAlpha(0.5),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
      },
    })
  );
}

function applyClear() {
  activeFeature.value = "point";
  const v = viewer.value;
  if (!v) return;
  v.entities.removeAll();
  added.clear();
  statusText.value = "已清除全部实体";
}

const codeMap: Record<string, () => string> = {
  point: () => `// ① Point：点状要素
viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(108.94, 34.342, 0),
  point: {
    pixelSize: 12,                 // 像素直径
    color: Cesium.Color.RED,
    outlineColor: Cesium.Color.WHITE,
    outlineWidth: 2,
  },
})`,

  label: () => `// ② Label：文字标注
viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(108.9435, 34.3425, 0),
  label: {
    text: '西安·钟楼',
    font: '16px Microsoft YaHei, sans-serif',
    fillColor: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.fromCssColorString('#c0392b'),
    outlineWidth: 4,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new Cesium.Cartesian2(0, -30),
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
  },
})`,

  billboard: () => `// ③ Billboard：广告牌（图片图标）
viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(108.947, 34.341, 0),
  billboard: {
    image: Cesium.buildModuleUrl('Assets/Textures/maki/star.png'),
    scale: 1.4,
    color: Cesium.Color.YELLOW,   // 整体着色
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
  },
})`,

  polyline: () => `// ④ Polyline：折线
viewer.entities.add({
  polyline: {
    positions: Cesium.Cartesian3.fromDegreesArray([
      108.94, 34.342, 108.945, 34.341, 108.952, 34.3395,
    ]),
    width: 6,
    material: new Cesium.PolylineGlowMaterialProperty({
      glowPower: 0.35, color: Cesium.Color.CYAN,
    }),
    clampToGround: true,  // 贴地（需地形或椭球）
  },
})`,

  polygon: () => `// ⑤ Polygon：多边形面
viewer.entities.add({
  polygon: {
    hierarchy: Cesium.Cartesian3.fromDegreesArray([
      108.955, 34.338, 108.962, 34.338,
      108.962, 34.343, 108.955, 34.343,
    ]),
    material: Cesium.Color.fromCssColorString('#27ae60').withAlpha(0.5),
    outline: true,
    outlineColor: Cesium.Color.WHITE,
  },
})`,

  wall: () => `// ⑥ Wall：墙体（上下缘可按点定义高度）
viewer.entities.add({
  wall: {
    positions: Cesium.Cartesian3.fromDegreesArrayHeights([
      108.93, 34.336, 0, 108.934, 34.336, 0,
      108.934, 34.340, 0, 108.93, 34.340, 0,
    ]),
    maximumHeights: [80, 60, 80, 60],  // 顶边高度
    minimumHeights: [0, 0, 0, 0],      // 底边高度
    material: Cesium.Color.fromCssColorString('#e67e22').withAlpha(0.7),
    outline: true,
    outlineColor: Cesium.Color.WHITE,
  },
})`,

  box: () => `// ⑦ Box：盒体（需指定中心位置）
viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(108.922, 34.344, 100),
  box: {
    dimensions: new Cesium.Cartesian3(300, 200, 200), // 长/宽/高(米)
    material: Cesium.Color.fromCssColorString('#8e44ad').withAlpha(0.8),
    outline: true,
    outlineColor: Cesium.Color.WHITE,
  },
})`,

  ellipsoid: () => `// ⑧ Ellipsoid：椭球体（球体是其特例）
viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(108.97, 34.218, 0),
  ellipsoid: {
    radii: new Cesium.Cartesian3(300, 300, 200), // 三轴半径(米)
    material: Cesium.Color.fromCssColorString('#3498db').withAlpha(0.45),
    outline: true,
    outlineColor: Cesium.Color.WHITE,
  },
})`,

  corridor: () => `// ⑨ Corridor：走廊/管道（沿线宽体）
viewer.entities.add({
  corridor: {
    positions: Cesium.Cartesian3.fromDegreesArray([
      108.92, 34.35, 108.928, 34.352, 108.936, 34.349,
    ]),
    width: 80,                        // 宽度(米)
    cornerType: Cesium.CornerType.ROUNDED,
    material: Cesium.Color.fromCssColorString('#f1c40f').withAlpha(0.5),
    outline: true,
    outlineColor: Cesium.Color.WHITE,
  },
})`,
};

const explainMap: Record<string, () => string> = {
  point:
    () => `【原理】Entity 是 Cesium 的“声明式”数据模型：一个对象 = 一个图形要素。
Point 在屏幕上以固定像素大小绘制，不随缩放改变。

【通用能力】所有 Entity 支持：
• 名称 name / 说明 description（可拾取展示）
• 可见性 show、显示距离 distanceDisplayCondition
• 随时间变化（position/graphics 可用 Property 驱动）`,

  label: () => `【原理】Label 是 HTML5 Canvas 绘制的文字（非 DOM），支持
字体、颜色、描边、样式、偏移、锚点（verticalOrigin/horizontalOrigin）等。

【要点】中文字体指定 Microsoft YaHei 等系统字体即可；
大量标注建议用 LabelCollection 以获得更好性能。`,

  billboard: () => `【原理】Billboard 用图片（URL/DataURI/Canvas）作为图标，
始终正对相机（广告牌特性），是 POI 图标的标准做法。

【要点】color 属性可对图标整体着色（白色图片效果最佳）；
maki 系列图标已随 Cesium 安装包内置，离线可用。`,

  polyline: () => `【原理】Polyline 渲染折线，支持多种材质（MaterialProperty）：
PolylineGlowMaterialProperty 发光、PolylineArrowMaterialProperty 箭头、
PolylineDashMaterialProperty 虚线等。

【要点】clampToGround 让线贴在地形上（需要开启地形时效果更明显）。`,

  polygon: () => `【原理】Polygon 依据闭合坐标环填充面，支持空洞
（PolygonHierarchy 嵌套环），常用于区域/地块/小区范围。

【要点】height 不设则贴地表；设高度可生成抬升面（如楼宇基座）。`,

  wall: () => `【原理】Wall 按底部路径和上下缘高度生成竖向墙体，
maximumHeights/minimumHeights 可为每个顶点单独指定，
常用于建筑白膜、挡土墙、河道断面等。`,

  box: () => `【原理】Box 以 position 为中心，按 dimensions(长宽高)
生成立方体。示意建筑、货柜、模型占位等常用。

【要点】默认朝向与经纬网格对齐，旋转可用 orientation 属性。`,

  ellipsoid:
    () => `【原理】Ellipsoid 生成三轴半径可调的椭球体（球体为三轴相等）。
常用于大气范围、传感器覆盖、缓冲区体等抽象表达。`,

  corridor: () => `【原理】Corridor 沿线生成指定宽度的“带状体”，
cornerType 控制拐角（ROUNDED 圆角 / MITERED 斜接 / BEVELED 切角），
适合表达道路、管道、航线走廊。`,
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
        :type="activeFeature === 'point' ? 'primary' : 'default'"
        @click="applyPoint"
        >点 Point</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'label' ? 'primary' : 'default'"
        @click="applyLabel"
        >标注 Label</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'billboard' ? 'primary' : 'default'"
        @click="applyBillboard"
        >图标 Billboard</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'polyline' ? 'primary' : 'default'"
        @click="applyPolyline"
        >线 Polyline</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'polygon' ? 'primary' : 'default'"
        @click="applyPolygon"
        >面 Polygon</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'wall' ? 'primary' : 'default'"
        @click="applyWall"
        >墙 Wall</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'box' ? 'primary' : 'default'"
        @click="applyBox"
        >盒 Box</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'ellipsoid' ? 'primary' : 'default'"
        @click="applyEllipsoid"
        >球 Ellipsoid</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'corridor' ? 'primary' : 'default'"
        @click="applyCorridor"
        >走廊 Corridor</n-button
      >
      <n-button size="small" quaternary @click="applyClear">全部清除</n-button>
    </div>

    <SplitViewer
      :title="activeFeature"
      :code="code"
      :explanation="explanation"
      :default-split-size="70"
      storage-key="entity-split"
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
