import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Unocss from 'unocss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    Unocss(),
    // 将 Cesium 运行时资源（Workers / Assets / ThirdParty / Widgets）拷贝到构建产物 /cesium/ 目录，
    // 运行时通过 CESIUM_BASE_URL 指向该目录，避免 Vite 打包破坏 Cesium 的静态资源引用。
    // 注意：插件始终保留源目录结构，需用 rename.stripBase 剥离
    // node_modules/cesium/Build/Cesium/ 这 5 层前缀，仅保留各资源目录内部结构。
    viteStaticCopy({
      targets: [
        { src: 'node_modules/cesium/Build/Cesium/Workers/**/*', dest: 'cesium/Workers', rename: { stripBase: 5 } },
        { src: 'node_modules/cesium/Build/Cesium/ThirdParty/**/*', dest: 'cesium/ThirdParty', rename: { stripBase: 5 } },
        { src: 'node_modules/cesium/Build/Cesium/Assets/**/*', dest: 'cesium/Assets', rename: { stripBase: 5 } },
        { src: 'node_modules/cesium/Build/Cesium/Widgets/**/*', dest: 'cesium/Widgets', rename: { stripBase: 5 } },
      ],
    }),
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium/'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
