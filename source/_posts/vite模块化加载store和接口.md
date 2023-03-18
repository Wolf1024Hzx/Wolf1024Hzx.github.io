---
title: vite模块化加载store和接口
tags:
  - 前端
categories:
  - 学习
toc:
  showListNumber: false
  maxDepth: 6
  minDepth: 1
date: 2023-03-11 21:40:45
---

## 问题描述

在过去的实习和项目开发经历中，规范的大项目都是使用 vue2，因此习惯了使用 webpack 的 require.context 批量导入模块。
但最近学习使用 vite + taildwindcss 进行开发时想起来 vite 没有这个接口，因此找办法代替

## 目录结构

![store缓存文件结构](/img/vite模块化加载store和接口/文件结构.jpg)

## webpack 写法

```JavaScript
// index.js
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)
Vue.config.devtools = true; // 打开vue调试工具
const files = require.context('./modules', false, /\.js$/)
const modules = {}

files.keys().forEach((key) => {
  modules[key.replace(/(\.\/|\.js)/g, '')] = files(key).default
})

Object.keys(modules).forEach((key) => {
  modules[key]['namespaced'] = true
})

const store = new Vuex.Store({
  modules
})

export default store
```

## vite 写法

```JavaScript
// index.js
import { createStore } from 'vuex'
const routeFiles = import.meta.globEager('@/store/modules/*.js')

const modules = {}
for (const path in routeFiles) {
  const key = path.match(/\/src\/store\/modules\/(.*?).js/)[1]
  modules[key] = routeFiles[path].default
  modules[key]['namespaced'] = true
}

export default createStore({
  modules
})
```

问题解决
