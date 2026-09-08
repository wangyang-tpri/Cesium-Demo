import { createApp } from 'vue';
import App from './App.vue';
import navie from 'naive-ui';

import router from '../router/index.ts';
import './assets/main.css';
import 'uno.css';

// Cesium 组件库样式（Viewer 控件 / 时间轴 / 动画控件等）
import 'cesium/Build/Cesium/Widgets/widgets.css';

// Cesium 运行时静态资源基址：
// - 生产构建：vite.config.ts 的 define 会把 Cesium 源码里的 CESIUM_BASE_URL 标识符替换为 '/cesium/'，
//   且 /cesium/ 目录已由 vite-plugin-static-copy 拷贝到 dist；
// - 开发模式：Vite 预打包不会替换 node_modules 内代码的标识符，这里显式设置全局变量即可生效。
//   Cesium 的 buildModuleUrl 会优先读取该全局变量（其次才回退到 import.meta.url）。
(window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = '/cesium/';

// Cesium Ion 访问令牌：
// 当前使用 CesiumJS 内置的默认评估 token（随 1.145 版本附带，可访问 Cesium World Terrain 等公开示例资源）。
// 生产环境请前往 https://ion.cesium.com 注册后，在代码中替换为自有 token：
//   import * as Cesium from 'cesium';
//   Cesium.Ion.defaultAccessToken = '你的 token';

createApp(App).use(router).use(navie).mount('#app');
