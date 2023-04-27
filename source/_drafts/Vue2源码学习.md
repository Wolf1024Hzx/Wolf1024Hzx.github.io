---
title: Vue2源码学习
tags: 前端
categories: 学习
---

# 前言

前几天搞定了虚拟 DOM 比较算法的始祖——Snabbdom 库，今天开始阅读 Vue2 源码
先从 github 仓库拉取 Vue2 的源码仓库

```shell
git clone https://github.com/vuejs/vue.git
```

![使用腾讯云COS搭建图床\20230426201443_c2fc5169e2f9830b624203269a20f153.png](https://wolf-blog-1314051886.cos.ap-guangzhou.myqcloud.com/%E4%BD%BF%E7%94%A8%E8%85%BE%E8%AE%AF%E4%BA%91COS%E6%90%AD%E5%BB%BA%E5%9B%BE%E5%BA%8A%5C20230426201443_c2fc5169e2f9830b624203269a20f153.png)