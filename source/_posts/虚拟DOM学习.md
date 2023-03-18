---
title: 虚拟DOM学习
tags: 前端
date: 2023-03-18 16:53:00
---


# 虚拟 DOM 介绍

早期 Web 开发中，视图改变都需要程序员手动修改 DOM。直到 jQuery 的时代，DOM 操作有了极大的简化，但仍然需要我们频繁操作 DOM 实现页面效果和交互。

随着数据驱动视图思想的出现，Vue 和 React 两大开发框架面世，提出了一个新的概念——虚拟 DOM。虚拟 DOM 是一层对真实 DOM 的抽象，以 JavaScript 对象 (VNode 节点) 作为基础的树，用对象的属性来描述节点。数据改变后，通过修改这个对象，然后把它与真实 DOM 进行比较，最后仅修改必要的 DOM 节点，就能完成视图更新。而这个 DOM 比较的算法就是 diff 算法。在不同开发框架，同一开发框架的不同版本中，diff 算法都有不同实现，**diff 算法发生在虚拟 DOM 上**。

## 虚拟 DOM 对象举例

```html
<!-- 真实DOM -->
<div class="box">
  <h1>标题</h1>
  <ul>
    <li>列表项1</li>
    <li>列表项2</li>
  </ul>
</div>
```

```JavaScript
/* 虚拟DOM */
{
  sel: 'div',
  data: {
    class: { box: true }
  },
  children: [
    { sel: 'h1', data: {}, text: '标题' },
    {
      sel: 'ul',
      data: {},
      children: [
        { sel: 'li', data: {}, text: '列表项1' },
        { sel: 'li', data: {}, text: '列表项2' }
      ]
    }
  ]
}
```

# diff 算法的起始——Snabbdom

[Snabbdom 项目 Github 地址](https://github.com/snabbdom/snabbdom)

Snabbdom 是一个虚拟 DOM 库，其核心代码只有约 200 行。下面先跑通 Snabbdom 的官方样例代码。

## Snabbdom 样例代码

先搭建运行环境。作为一个虚拟 DOM 库，当然不能运行在 nodejs 环境，因此先搭建 webpack-dev-server。

初始化项目，并安装依赖

```shell
npm init
npm i -D snabbdom
npm i --legacy-peer-deps -D webpack@5 webpack-cli@3 webpack-dev-server@3
```

配置 webpack.config.js

```JavaScript
/* webpack.config.js */
const path = require('path');

module.exports = {
  mode: 'development',
  entry: './src/index.js',
  output: {
    publicPath: 'fake',
    filename: 'bundle.js',
  },
  devServer: {
    port: 8080,
    contentBase: 'www'
  }
};
```

创建 src 和 www 目录，分别创建 index.js 和 html 文件后，此时项目目录结构如下：
![Snabbdom初始化项目结构](/img/虚拟DOM学习/Snabbdom/Snabbdom项目初始化结构.jpg)

复制 Snabbdom 官方样例代码到 index.js 中

```JavaScript
/* src/index.js */
import {
  init,
  classModule,
  propsModule,
  styleModule,
  eventListenersModule,
  h,
} from "snabbdom"

const patch = init([
  // 通过传入模块初始化 patch 函数
  classModule, // 开启 classes 功能
  propsModule, // 支持传入 props
  styleModule, // 支持内联样式同时支持动画
  eventListenersModule, // 添加事件监听
])

const container = document.getElementById("container")

const vnode = h("div#container.two.classes", { on: { click: () => {} } }, [
  h("span", { style: { fontWeight: "bold" } }, "This is bold"),
  " and this is just normal text",
  h("a", { props: { href: "/foo" } }, "I'll take you places!"),
])
// 传入一个空的元素节点 - 将产生副作用（修改该节点）
patch(container, vnode)

const newVnode = h(
  "div#container.two.classes",
  { on: { click: () => {} } },
  [
    h(
      "span",
      { style: { fontWeight: "normal", fontStyle: "italic" } },
      "This is now italic type"
    ),
    " and this is still just normal text",
    h("a", { props: { href: "/bar" } }, "I'll take you places!"),
  ]
)
// 再次调用 `patch`
patch(vnode, newVnode) // 将旧节点更新为新节点
```

观察代码可知，需要一个 id 为 container 的 div。因此在 index.html 中创建该 div 元素，并用 script 标签引入 webpack 打包后的虚拟 bundle.js 文件

```html
<body>
  <div id="container"></div>
  <script src="/fake/bundle.js"></script>
</body>
```

在 package.json 中配置好 dev 脚本

```json
/* package.json部分 */
{
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "dev": "webpack-dev-server"
  }
}
```

npm run dev 运行该脚本，即可访问 http://localhost:8080 观察样例代码运行结果

![Snabbdom样例代码运行结果](/img/虚拟DOM学习/Snabbdom/Snabbdom样例代码运行结果.jpg)

## 样例代码研究

再贴一次样例代码方便观察

```JavaScript
/* src/index.js */
import {
  init,
  classModule,
  propsModule,
  styleModule,
  eventListenersModule,
  h,
} from "snabbdom"

const patch = init([
  // 通过传入模块初始化 patch 函数
  classModule, // 开启 classes 功能
  propsModule, // 支持传入 props
  styleModule, // 支持内联样式同时支持动画
  eventListenersModule, // 添加事件监听
])

const container = document.getElementById("container")

const vnode = h("div#container.two.classes", { on: { click: () => {} } }, [
  h("span", { style: { fontWeight: "bold" } }, "This is bold"),
  " and this is just normal text",
  h("a", { props: { href: "/foo" } }, "I'll take you places!"),
])
// 传入一个空的元素节点 - 将产生副作用（修改该节点）
patch(container, vnode)

const newVnode = h(
  "div#container.two.classes",
  { on: { click: () => {} } },
  [
    h(
      "span",
      { style: { fontWeight: "normal", fontStyle: "italic" } },
      "This is now italic type"
    ),
    " and this is still just normal text",
    h("a", { props: { href: "/bar" } }, "I'll take you places!"),
  ]
)
// 再次调用 `patch`
patch(vnode, newVnode) // 将旧节点更新为新节点
```

首先不难猜出，h 函数的作用就是创建一个虚拟 DOM 节点，下面点进 h 函数阅读 ts 源码（已加上注释）

### h 函数——用于创建虚拟节点

```TypeScript
export function h(sel: any, b?: any, c?: any): VNode {
  let data: VNodeData = {};
  let children: any;
  let text: any;
  let i: number;
  if (c !== undefined) {
    /* data就是class等属性 */
    if (b !== null) {
      data = b;
    }
    /* 参数c是一个数组，则数组内部每一项都是虚拟DOM对象，都是这个节点的孩子 */
    if (is.array(c)) {
      children = c;
    }
    /* 参数c是string或number，则这个节点里的文本内容就是参数c */
    else if (is.primitive(c)) {
      text = c.toString();
    }
    /* 根据c的sel属性存在，可以得知参数c也是一个虚拟DOM对象 */
    else if (c && c.sel) {
      children = [c];
    }
  }
  /* 只有两个参数，没有c，进行一样的判断 */
  else if (b !== undefined && b !== null) {
    if (is.array(b)) {
      children = b;
    } else if (is.primitive(b)) {
      text = b.toString();
    } else if (b && b.sel) {
      children = [b];
    } else {
      data = b;
    }
  }
  if (children !== undefined) {
    for (i = 0; i < children.length; ++i) {
      /* 如果children中的某一项不是一个对象，只是一个string或number，那么生成一个虚拟DOM包裹这个文本内容 */
      if (is.primitive(children[i]))
        children[i] = vnode(
          undefined, /* sel */
          undefined, /* data */
          undefined, /* children */
          children[i], /* text */
          undefined /* elm */
        );
    }
  }
  if (
    sel[0] === "s" &&
    sel[1] === "v" &&
    sel[2] === "g" &&
    (sel.length === 3 || sel[3] === "." || sel[3] === "#")
  ) {
    addNS(data, children, sel);
  }
  return vnode(sel, data, children, text, undefined);
}
```

这个函数还是相当好理解的，根据参数的类型和数量，返回一个 VNode 类型的对象（vnode 函数返回 new 出来的），也就是一个虚拟 DOM 节点

### h 函数的返回值——VNode 对象

既然 h 函数返回的是一个 VNode 对象，那接下来看看这个类是个什么东西

```TypeScript
export type Key = string | number | symbol;

export interface VNode {
  sel: string | undefined;                      // selector，选择器，DOM节点的标签
  data: VNodeData | undefined;                  // 节点属性，详细定义见下面VNodeData
  children: Array<VNode | string> | undefined;  // 子结点
  elm: Node | undefined;                        // 剧透，这个属性是对应的真实DOM节点，undefined表示这个虚拟节点未上树
  text: string | undefined;                     // 节点内部
  key: Key | undefined;                         // 节点唯一标识，Vue里的key就是这个东西啦
}

export interface VNodeData {
  props?: Props;
  attrs?: Attrs;
  class?: Classes;
  style?: VNodeStyle;
  dataset?: Dataset;
  on?: On;
  attachData?: AttachData;
  hook?: Hooks;
  key?: Key;
  ns?: string; // for SVGs
  fn?: () => VNode; // for thunks
  args?: any[]; // for thunks
  is?: string; // for custom elements v1
  [key: string]: any; // for any other 3rd party module
}
```

这下虚拟 DOM 节点对象的结构就非常清楚了，但还有个小小的问题，props 和 attrs 的区别是什么呢？
可以学习这 2 篇博客：

- [DOM 中 property 和 attribute 详解 1](https://www.bbsmax.com/A/GBJr7NBB50/)
- [DOM 中 property 和 attribute 详解 2](https://www.bbsmax.com/A/gAJGGAr8JZ/)

简单的总结一下就是，这两者的区分没有什么规则，但有一定规律，并且props是DOM元素初始化时自带的一些属性

# 未完待续

# 虚拟 DOM 的优缺点

## 优点

- 保证性能下限： 框架的虚拟 DOM 需要适配任何上层 API 可能产生的操作，它的一些 DOM 操作的实现必须是普适的，所以它的性能并不是最优的；但是比起粗暴的 DOM 操作性能要好很多，因此框架的虚拟 DOM 至少可以保证在不需要手动优化的情况下，依然可以提供还不错的性能，即保证性能的下限；
- 无需手动操作 DOM： 不再需要手动去操作 DOM，只需要写好 View-Model 的代码逻辑，框架会根据虚拟 DOM 和 数据双向绑定，以可预期的方式更新视图，极大提高开发效率；
- 跨平台： 虚拟 DOM 本质上是 JavaScript 对象,而 DOM 与平台强相关，相比之下虚拟 DOM 可以进行更方便地跨平台操作，例如服务器渲染、weex 开发等等。

## 缺点

- 无法进行极致优化： 虽然虚拟 DOM + 合理的优化，足以应对绝大部分应用的性能需求，但在一些性能要求极高的应用中虚拟 DOM 无法进行针对性的极致优化；
- 首次渲染大量 DOM 时，由于多了一层虚拟 DOM 的计算，会比 innerHTML 插入慢。
