import type * as Cesium from 'cesium';

/**
 * 当前活动的 Cesium Viewer 实例（模块级单例）。
 * useCesiumViewer 创建 viewer 后设置，销毁时清除。
 * SplitViewer 等公共组件可读取以监听相机变化、显示缩放层级等。
 */
let currentViewer: Cesium.Viewer | null = null;

/** 相机变化监听器列表 */
const cameraListeners = Array<(viewer: Cesium.Viewer) => void>();

/**
 * 设置当前 viewer（useCesiumViewer 内部调用）
 */
export function setCurrentViewer(viewer: Cesium.Viewer | null) {
  currentViewer = viewer;
  if (viewer) {
    // 通知所有监听器
    for (const listener of cameraListeners) {
      listener(viewer);
    }
    // 监听相机变化
    viewer.camera.changed.addEventListener(() => {
      for (const listener of cameraListeners) {
        listener(viewer);
      }
    });
  }
}

/**
 * 获取当前 viewer
 */
export function getCurrentViewer(): Cesium.Viewer | null {
  return currentViewer;
}

/**
 * 注册相机变化监听器，返回取消监听函数
 */
export function onCameraChange(listener: (viewer: Cesium.Viewer) => void): () => void {
  cameraListeners.push(listener);
  // 立即触发一次（如果 viewer 已存在）
  if (currentViewer) {
    listener(currentViewer);
  }
  return () => {
    const idx = cameraListeners.indexOf(listener);
    if (idx >= 0) cameraListeners.splice(idx, 1);
  };
}

/**
 * 根据相机高度估算 Web 地图缩放层级（Web 墨卡托投影近似）
 * @param height 相机高度（米）
 * @returns 缩放层级（0-22）
 */
export function estimateZoomLevel(height: number): number {
  if (height <= 0) return 22;
  // 标准 Web 墨卡托：zoom 0 时赤道周长 / 256 像素 ≈ 156543.03 米/像素
  // zoom n 时米/像素 = 156543.03 / 2^n
  // 假设屏幕高度约 600px，fov 60度，可见地面宽度 ≈ height * 2 * tan(30°) ≈ height * 1.155
  // 米/像素 ≈ height * 1.155 / 600 ≈ height * 0.001925
  // zoom = log2(156543.03 / (height * 0.001925)) ≈ log2(81320000 / height)
  const zoom = Math.log2(81320000 / height);
  return Math.max(0, Math.min(22, Math.round(zoom)));
}

/**
 * 格式化高度显示（米/公里）
 */
export function formatHeight(height: number): string {
  if (height >= 1000) {
    return `${(height / 1000).toFixed(1)} km`;
  }
  return `${height.toFixed(0)} m`;
}
