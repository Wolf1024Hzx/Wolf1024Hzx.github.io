---
title: 虚拟DOM学习
tags: 前端
date: 2023-03-18 16:53:00
categories: 学习
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

## Snabbdom 源码阅读

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

简单的总结一下就是，这两者的区分没有什么规则，但有一定规律，并且 props 是 DOM 元素初始化时自带的一些属性
了解清楚创建虚拟 DOM 节点的过程后，下一步开始学习将这个节点渲染到真实 DOM 上的过程

### 把虚拟 DOM 节点对象渲染到真实 DOM

首先，我们先截取出样例代码的第一个虚拟 DOM，也就是 vnode 的渲染这一块，并且把最外层 h 函数中的 id 改成 outer：

```Javascript
const container = document.getElementById("container")

// 注意这里id换成了outer
const vnode = h("div#outer.two.classes", { on: { click: () => { } } }, [
  h("span", { style: { fontWeight: "bold" } }, "This is bold"),
  " and this is just normal text",
  h("a", { props: { href: "/foo" } }, "I'll take you places!"),
])

patch(container, vnode)
```

如果只运行这部分代码，页面会呈现什么样子呢，下面是页面的效果和 html 结构
![页面效果和html结构](/img/虚拟DOM学习/Snabbdom/修改id为outer后运行结果.jpg)
body 下的 div 的 id 变成了 outer，那 patch 函数的作用就非常明显了，就是替换掉真实 DOM 元素！
但这个过程显然不可能是把整个真实的 DOM 节点直接替换，这样开销实在是太大了。因此 patch 函数内部的逻辑必然是只替换内容有改变，或插入新增的 DOM 元素，本文心心念念的第一个 diff 算法就在里面！

而 patch 函数是通过 init 函数生成的，因此让我们深入到 init 函数中

#### init 函数——返回实现 diff 函数的 patch

init 函数非常长，因此先抛开功能函数，直接关注 init 函数真实执行的部分

```TypeScript
export function init(
  modules: Array<Partial<Module>>,
  domApi?: DOMAPI,
  options?: Options
) {
  const cbs: ModuleHooks = {
    create: [],
    update: [],
    remove: [],
    destroy: [],
    pre: [],
    post: [],
  };

  const api: DOMAPI = domApi !== undefined ? domApi : htmlDomApi;

  // 收集第三方模块提供的各种钩子
  for (const hook of hooks) {
    for (const module of modules) {
      const currentHook = module[hook];
      if (currentHook !== undefined) {
        (cbs[hook] as any[]).push(currentHook);
      }
    }
  }

  // 一些功能函数

  return function patch(
    oldVnode: VNode | Element | DocumentFragment,
    vnode: VNode
  ): VNode {
    let i: number, elm: Node, parent: Node;
    const insertedVnodeQueue: VNodeQueue = [];
    // 先执行第三方模块传入的pre钩子
    for (i = 0; i < cbs.pre.length; ++i) cbs.pre[i]();

    // 如果oldVnode是真实DOM，返回一个只有指向真实DOM的指针的虚拟DOM
    if (isElement(api, oldVnode)) {
      oldVnode = emptyNodeAt(oldVnode);
    }
    // 同理，判断是否真实DocumentFragmentAt，返回虚拟的vnode对象
    else if (isDocumentFragment(api, oldVnode)) {
      oldVnode = emptyDocumentFragmentAt(oldVnode);
    }

    // 判断两个虚拟DOM对象的key、data类型、标签、id、class（标签、id和class都为空时判断内部文本内容类型）是否全都相同
    // 是的话可以确定，新旧虚拟DOM指向同一个真实DOM（或者同一个template），需要替换内容
    if (sameVnode(oldVnode, vnode)) {
      patchVnode(oldVnode, vnode, insertedVnodeQueue);
    }
    // 否则直接删掉旧虚拟DOM指向的真实DOM，给新的虚拟DOM创建真实DOM，接到父节点上
    else {
      elm = oldVnode.elm!;
      parent = api.parentNode(elm) as Node;

      // 这个函数用于递归创建出一整棵以vnode为根的真实DOM树
      createElm(vnode, insertedVnodeQueue);

      if (parent !== null) {
        api.insertBefore(parent, vnode.elm!, api.nextSibling(elm));
        // 传入虚拟DOM，批量递归删除真实DOM
        removeVnodes(parent, [oldVnode], 0, 0);
      }
    }

    // 最后替换完毕后按顺序执行inserted钩子
    for (i = 0; i < insertedVnodeQueue.length; ++i) {
      insertedVnodeQueue[i].data!.hook!.insert!(insertedVnodeQueue[i]);
    }
    // 然后执行post钩子
    for (i = 0; i < cbs.post.length; ++i) cbs.post[i]();
    return vnode;
  };
}
```

只看这部分就可以发现，对 patch 函数的执行逻辑影响最大的，是`sameVnode(oldVnode, vnode)`的判断结果
而`sameVnode`的判断逻辑如注释所说，判断两个虚拟 DOM 对象的 key、data、标签、id、class（标签、id 和 class 都为空时判断内部文本内容类型）是否全都相同
也就是说，**除非新旧虚拟 DOM 节点的 key、data 类型、标签、id、class 全都一样；或者都没有标签、id、class，但 key、data 类型 一样，且都没有文本内容；否则不会采用 diff 算法，而是直接删掉旧的真实 DOM，生成新的真实 DOM 换上。**

而进入`sameVnode(oldVnode, vnode)`的判断后，只执行了 patchVnode 这么一个函数，因此继续进入 patchVnode 函数

#### patchVnode 函数——替换新旧虚拟 DOM 节点的孩子/文本内容

先看两个功能函数，`addVnodes`和`removeVnodes`
这两个功能函数看名字就知道是什么作用：

- `function addVnodes(parentElm: Node,before: Node | null,vnodes: VNode[],startIdx: number,endIdx: number,insertedVnodeQueue: VNodeQueue)`**在 parentElm 内部，before 的前面批量插入 vnodes 数组从 startIdx 到 endIdx 的节点（创建真实 DOM 插入 parentElm 内）**
- `function removeVnodes(parentElm: Node,vnodes: VNode[],startIdx: number,endIdx: number)`**在真实 DOM 上的 parentElm 中，删掉 vnodes 数组[startIdx, endIdx]范围内的节点**

这两个功能函数由于要执行第三方模块传入的钩子，以及 vnode 本身存在 data 中的钩子，因此还是比较复杂的，但不影响主线逻辑，因此不在这里展开。有兴趣还是建议阅读一下源码，尤其是`removeVnodes`，通过设置计数器，每次执行 destroy 钩子调用回调函数使计数器减一，确保执行完所有 destroy 钩子后，计数器为 0 时，才真正移除真实 DOM ，这里的设计非常有意思

```TypeScript
/**
   *
   * @param oldVnode 旧的虚拟DOM节点对象
   * @param vnode 新的虚拟DOM节点对象
   * @param insertedVnodeQueue 为inserted钩子准备的队列
   * @description 完成新旧虚拟DOM中孩子/文本内容的替换
   */
  function patchVnode(
    oldVnode: VNode,
    vnode: VNode,
    insertedVnodeQueue: VNodeQueue
  ) {
    // 被替换前先执行prepatch钩子
    const hook = vnode.data?.hook;
    hook?.prepatch?.(oldVnode, vnode);
    const elm = (vnode.elm = oldVnode.elm)!;
    // 两个vnode虚拟DOM对象地址都一样，那就不用替换了
    if (oldVnode === vnode) return;

    // 只要新的vnode存在data，或者新旧vnode的文本内容不一样，就要执行update钩子，第三方模块和vnode自己的都要
    if (vnode.data !== undefined || (isDef(vnode.text) && vnode.text !== oldVnode.text)) {
      vnode.data ??= {};
      oldVnode.data ??= {};
      for (let i = 0; i < cbs.update.length; ++i)
        cbs.update[i](oldVnode, vnode);
      vnode.data?.hook?.update?.(oldVnode, vnode);
    }
    // 找到新旧vnode的children（都是vnode，也就是虚拟DOM对象）
    const oldCh = oldVnode.children as VNode[];
    const ch = vnode.children as VNode[];

    // 如果新的vnode没有文本内容
    if (isUndef(vnode.text)) {
      // 新的vnode和旧的vnode都有孩子
      // TODO 先放着，待会再看
      if (isDef(oldCh) && isDef(ch)) {
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue);
      }
      // 只有新的vnode有孩子，这好办，清空这个真实DOM的文本内容，把新vnode下的孩子都转成真实DOM插入到这个节点就好了
      else if (isDef(ch)) {
        if (isDef(oldVnode.text)) api.setTextContent(elm, "");
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue);
      }
      // 只有旧节点有孩子，新节点没有，也好办，直接删光真实DOM节点下的所有孩子就好（如果旧节点有孩子，说明没有文本内容，不用考虑TextContent）
      else if (isDef(oldCh)) {
        removeVnodes(elm, oldCh, 0, oldCh.length - 1);
      }
      // 新旧节点都没有孩子，而且新节点也没有文本内容，那要做的变化就是把旧节点的文本内容清空
      else if (isDef(oldVnode.text)) {
        api.setTextContent(elm, "");
      }
    }
    // 新vnode有文本内容，旧的vnode不知道有没有，但不全等（隐藏条件是，新vnode没有孩子）
    else if (oldVnode.text !== vnode.text) {
      // 旧vnode有孩子，但新vnode没有，和上面一样，直接删光真实DOM节点下的所有孩子就好
      if (isDef(oldCh)) {
        removeVnodes(elm, oldCh, 0, oldCh.length - 1);
      }
      // 设置文本内容
      api.setTextContent(elm, vnode.text!);
    }
    // 如果上面的判断都没进入，说明新旧节点都由文本内容（也就是都没有孩子），文本内容还完全一样

    // 比对完新旧节点，两个虚拟DOM的孩子或文本内容已经换成新的虚拟DOM了
    hook?.postpatch?.(oldVnode, vnode);
  }
```

这个函数也是看起来长，实际上逻辑很好理解：

- 如果新的 vnode 有文本内容，那最简单，把旧 vnode 指向的真实 DOM 的孩子清空（如果有的话），然后文本内容换成新 vnode 的内容就好了
- 如果新 vnode 没有文本内容，那进一步分情况讨论
  - 如果新 vnode 没有孩子，旧 vnode 也没有，那把真实 DOM 的文本内容清空
  - 如果新 vnode 没有孩子，旧 vnode 有，把这个真实 DOM 下的孩子节点都删空（也就是 oldVnode 的 children 指向的真实 DOM）
  - 如果新 vnode 有孩子，旧 vnode 没有，清空真实 DOM 的文本内容，然后为新 vnode 的孩子们创建真实 DOM，插入到新旧 vnode 共同指向的真实 DOM 中
  - 如果新 vnode 有孩子，旧 vnode 也有，最麻烦的情况，调用了`updateChildren`函数处理（先经过新 vnode 与旧 vnode 的孩子数组地址是否一样的判断，孩子数组的地址都一样那就不需要更新孩子了）

理清楚这个判断逻辑后，真正需要耗费脑力的，就是这个`updateChildren`函数了。

但先不急着进入这个函数，先考虑一个小问题：patchVnode 函数执行完，就意味着 patch 函数的主要逻辑已经结束了，只剩下 inserted 和 post 钩子的执行，那 **data 是在哪里更新的呢？？** 难道说就是在`updateChildren`函数里，只要不调用 updateChildren，data 就不会更新？
下面先验证一下这个猜想

#### 寻找 vnode 的 data 的更新位置

根据上面的分析，我们知道，如果 patch 的第一个参数是一个真实 dom，只要第二个参数传入的虚拟 DOM vnode 的标签、selector 都和第一个参数一样，并且 data 不为空（可以是空对象，data 这个属性不是 null 或 undefine 就好了），`patch`就会调用`patchVnode`（如果不调用`patchVnode`，我们传入的新 vnode 会直接生成一个新的真实 DOM，data 就不算更新，而是删光原来的再新建一个）。
因此修改一下我们的 index.js，让 vnode 的 selector 与真实 DOM div 保持一致，然后给个新的 data（这里用 props 中的 href）：

```html
<body>
  <div id="container">你好</div>
  <script src="/fake/bundle.js"></script>
</body>
```

```JavaScript
const container = document.getElementById("container")

const vnode = h("div#container", { props: { href: '123' } }, '哈哈')

patch(container, vnode)
```

然后修改一下 snabbdom 源码（build 里的 js 文件，ts 只是阅读的，js 才是实际调用的）
![验证vnode的data的更新位置](/img/虚拟DOM学习/Snabbdom/验证vnode的data的更新位置.jpg)
然后运行 dev server，观察输出结果：
![data更新位置在update钩子函数里](/img/虚拟DOM学习/Snabbdom/data更新位置在update钩子函数里.jpg)
这下结果就很明显了，**data 的更新位置在第三方模块传入的 update 钩子中！**

既然是第三方传入的，那不急着看传入的 update 钩子函数的内容；但我们得到了一个结论，`patchVnode`函数看起来只更新孩子节点或文本内容，是因为在开头的钩子函数中已经处理 data 的更新。
接下来就进入`updateChildren`函数，观察两个 vnode 都有孩子的情况下，真实 DOM 是怎么更新的

#### updateChildren 函数——新旧 vnode 都有孩子的情况下更新真实 DOM

未完待续

# 虚拟 DOM 的优缺点

## 优点

- 保证性能下限： 框架的虚拟 DOM 需要适配任何上层 API 可能产生的操作，它的一些 DOM 操作的实现必须是普适的，所以它的性能并不是最优的；但是比起粗暴的 DOM 操作性能要好很多，因此框架的虚拟 DOM 至少可以保证在不需要手动优化的情况下，依然可以提供还不错的性能，即保证性能的下限；
- 无需手动操作 DOM： 不再需要手动去操作 DOM，只需要写好 View-Model 的代码逻辑，框架会根据虚拟 DOM 和 数据双向绑定，以可预期的方式更新视图，极大提高开发效率；
- 跨平台： 虚拟 DOM 本质上是 JavaScript 对象,而 DOM 与平台强相关，相比之下虚拟 DOM 可以进行更方便地跨平台操作，例如服务器渲染、weex 开发等等。

## 缺点

- 无法进行极致优化： 虽然虚拟 DOM + 合理的优化，足以应对绝大部分应用的性能需求，但在一些性能要求极高的应用中虚拟 DOM 无法进行针对性的极致优化；
- 首次渲染大量 DOM 时，由于多了一层虚拟 DOM 的计算，会比 innerHTML 插入慢。
