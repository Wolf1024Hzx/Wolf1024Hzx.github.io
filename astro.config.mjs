import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://wolf1024hzx.github.io',
  markdown: {
    shikiConfig: {
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
