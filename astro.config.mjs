import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://wolf1024hzx.github.io',
  markdown: {
    shikiConfig: {
      // 双主题代码高亮，配合全局样式中的 data-theme 切换
      themes: {
        light: 'vitesse-light',
        dark: 'vitesse-dark',
      },
      // 兼容旧 Hexo 文章中不规范/大小写各异的代码块语言标记
      langAlias: {
        golang: 'go',
        Java: 'java',
        JavaScript: 'javascript',
        Javascript: 'javascript',
        JavaScipt: 'javascript',
        TypeScript: 'typescript',
        BASH: 'bash',
        vbnet: 'vb',
      },
    },
  },
});
