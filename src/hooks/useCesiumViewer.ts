import * as Cesium from 'cesium';
import { onBeforeUnmount, onMounted, shallowRef, type Ref } from 'vue';

export interface UseCesiumViewerOptions {
  /** 影像底图：'esri'(默认) | 'osm' | 'none'（无底图） | 自定义 ImageryLayer */
  baseLayer?: 'esri' | 'osm' | 'none' | Cesium.ImageryLayer;
  /** 是否使用 Cesium World Terrain 全球地形（需 Ion token，默认 false 使用椭球面） */
  terrain?: boolean;
  /** 初始相机：经纬度(度) + 高度(米)，以及朝向 heading/pitch/roll(度) */
  camera?: {
    position?: [number, number, number];
    heading?: number;
    pitch?: number;
    roll?: number;
  };
  /** UI 控件开关（默认全部关闭，按页面需要开启） */
  ui?: {
    animation?: boolean;
    timeline?: boolean;
    baseLayerPicker?: boolean;
    geocoder?: boolean;
    homeButton?: boolean;
    sceneModePicker?: boolean;
    navigationHelpButton?: boolean;
    fullscreenButton?: boolean;
    infoBox?: boolean;
    selectionIndicator?: boolean;
  };
  /** 时钟配置；不传则使用 Viewer 默认时钟（禁用动画控件） */
  clock?: {
    start: Cesium.JulianDate;
    stop: Cesium.JulianDate;
    currentTime?: Cesium.JulianDate;
    multiplier?: number;
    shouldAnimate?: boolean;
    range?: Cesium.ClockRange;
  } | false;
  /** 每帧回调（在 clock.onTick 中触发），time 为当前模拟时间 */
  onTick?: (viewer: Cesium.Viewer, time: Cesium.JulianDate) => void;
  /** 组件卸载时的附加清理 */
  onDispose?: () => void;
}

const DEFAULT_CAMERA = {
  position: [104.0, 35.0, 8000000] as [number, number, number],
  heading: 0,
  pitch: -60,
  roll: 0,
};

/**
 * Cesium Viewer 生命周期统一封装：
 * 创建三维地球（Viewer）、影像底图、地形、初始相机视角、
 * 每帧回调（clock.onTick）、容器尺寸同步、组件卸载销毁。
 *
 * 用法：
 * const { viewer } = useCesiumViewer(containerRef, {
 *   baseLayer: 'esri',
 *   terrain: true,
 *   camera: { position: [108.9, 34.2, 2000], pitch: -45 },
 *   onTick: (v, time) => { ... },
 *   onDispose: () => { ... },
 * })
 */
export function useCesiumViewer(
  containerRef: Ref<HTMLDivElement | null>,
  options: UseCesiumViewerOptions = {}
) {
  const viewer = shallowRef<Cesium.Viewer | null>(null);

  let resizeObserver: ResizeObserver | null = null;
  let tickRemove: (() => void) | null = null;
  let disposed = false;

  const ui = options.ui ?? {};
  const camera = { ...DEFAULT_CAMERA, ...options.camera };

  function buildBaseLayer(): Cesium.ImageryLayer | false {
    const baseLayer = options.baseLayer ?? 'esri';
    if (baseLayer === 'none') return false;
    if (baseLayer instanceof Cesium.ImageryLayer) return baseLayer;

    if (baseLayer === 'osm') {
      // OpenStreetMap 标准瓦片：{z}/{x}/{y}
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        credit: '© OpenStreetMap contributors',
        maximumLevel: 19,
      });
      return new Cesium.ImageryLayer(provider);
    }
    // 默认：Esri World Imagery 全球影像（无需 token，{z}/{y}/{x} 注意顺序）
    const provider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      credit: 'Imagery © Esri, Maxar, Earthstar Geographics',
      maximumLevel: 19,
    });
    return new Cesium.ImageryLayer(provider);
  }

  function init() {
    const container = containerRef.value;
    if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;
    if (disposed) return;

    const v = new Cesium.Viewer(container, {
      baseLayer: buildBaseLayer(),
      baseLayerPicker: ui.baseLayerPicker ?? false,
      geocoder: ui.geocoder ?? false,
      homeButton: ui.homeButton ?? true,
      sceneModePicker: ui.sceneModePicker ?? true,
      navigationHelpButton: ui.navigationHelpButton ?? true,
      fullscreenButton: ui.fullscreenButton ?? false,
      infoBox: ui.infoBox ?? false,
      selectionIndicator: ui.selectionIndicator ?? true,
      animation: ui.animation ?? false,
      timeline: ui.timeline ?? false,
      shouldAnimate: options.clock ? (options.clock.shouldAnimate ?? false) : false,
      ...(options.terrain
        ? { terrain: new Cesium.Terrain(Cesium.createWorldTerrainAsync()) }
        : {}),
    });
    viewer.value = v;

    // 初始相机视角
    v.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(...camera.position),
      orientation: {
        heading: Cesium.Math.toRadians(camera.heading ?? 0),
        pitch: Cesium.Math.toRadians(camera.pitch ?? -60),
        roll: Cesium.Math.toRadians(camera.roll ?? 0),
      },
    });

    // 时钟配置（若提供）—— 只设置显式传入的参数，避免把 startTime 等设为 undefined
    if (options.clock) {
      if (options.clock.start) v.clock.startTime = options.clock.start;
      if (options.clock.stop) v.clock.stopTime = options.clock.stop;
      if (options.clock.currentTime) v.clock.currentTime = options.clock.currentTime;
      else if (options.clock.start) v.clock.currentTime = options.clock.start;
      if (options.clock.multiplier) v.clock.multiplier = options.clock.multiplier;
      if (options.clock.range) v.clock.clockRange = options.clock.range;
    }

    // 每帧回调
    if (options.onTick) {
      const listener = (time: Cesium.JulianDate) => {
        if (viewer.value) options.onTick?.(viewer.value, time);
      };
      v.clock.onTick.addEventListener(listener);
      tickRemove = () => v.clock.onTick.removeEventListener(listener);
    }

    // 容器尺寸变化时同步渲染尺寸
    resizeObserver = new ResizeObserver(() => {
      if (viewer.value) viewer.value.resize();
    });
    resizeObserver.observe(container);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    resizeObserver?.disconnect();
    resizeObserver = null;
    tickRemove?.();
    tickRemove = null;
    viewer.value?.destroy();
    viewer.value = null;
    options.onDispose?.();
  }

  onMounted(init);
  onBeforeUnmount(dispose);

  return { viewer, init, dispose };
}
