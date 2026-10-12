import { defineConfig } from '@inugram/cli'

export default defineConfig({
  outDir: 'dist',
  plugins: {
    tablet: {
      entry: 'src/tablet/index.ts',
      manifest: {
        id: 'com.github.fungalspores.tablet-anywhere',
        name: 'Tablet Anywhere',
        author: 'fungalspores',
        version: '1.2.0',
        description: {
          en: 'Two-pane tablet layout in split-screen, windows and portrait, not only fullscreen',
          ru: 'Планшетный режим (две панели) в split-screen, окне и портрете, а не только на весь экран',
        },
        icon: 'inu://settings',
        grants: ['unsafe.jvm', 'unsafe.xposed'],
      },
    },
  },
})
