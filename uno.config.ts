import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetUno,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss';

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons(),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  shortcuts: {
    'flex-center': 'flex justify-center items-center',
  },
});
