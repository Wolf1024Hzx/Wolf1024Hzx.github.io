---
title: GitHub Actions npm install 卡死排查记录（lockfile 的内网 registry URL）
tags: 前端
categories: 前端
date: 2026-07-31 15:08:00
---
**环境：** Astro 静态博客，GitHub Actions 部署到 GitHub Pages（`ubuntu-latest` runner，Node 22，npm 安装依赖）

## 异常现象

某次 push 后，GitHub Actions 的部署卡在 **Install dependencies** 这一步，页面上的日志一片空白，转了 8 分钟圈后 npm 自己崩溃：

```text
npm error Exit handler never called!
npm error This is an error with npm itself. Please report this error at:
npm error   <https://github.com/npm/cli/issues>
```

没有下载进度、没有报错对象、没有任何有用的上下文。之后连续重试了几次，每一次都一模一样地卡死。

## 排查过程踩坑

这个报错字面上看起来 npm 自身有 bug，加上当天我刚好改过 CI 配置，于是进行下列四点排查：

1. **怀疑 action 大版本升级**。当天把 checkout/setup-node 等 action 从 v4 系列升到了最新版，失败恰好从那次升级后开始。回滚到旧版 action——还是挂。
2. **怀疑 astro 补丁更新**。同一次提交里 astro 从 7.1.4 升到了 7.1.6。对比升级前后的 lockfile：只有 15 个包的纯版本号变化，零新增依赖——这点变化不可能让安装从 20 秒变成永久挂死。排除。
3. **怀疑 `npm install` 本身**。换成 CI 推荐的 `npm ci`——挂。再加上 fetch 超时重试参数——还是挂。
4. **怀疑 GitHub 故障**。查 GitHub Status：All Systems Operational。

整理一下五次运行的对照：

| 时间 | actions | 安装方式 | 结果 |
| --- | --- | --- | --- |
| 06:05 | v4 | install | 成功（全程 42 秒） |
| 06:12 | v7 | install | 挂死 8 分钟后崩溃 |
| 06:22 | v7 | ci | 挂死 |
| 06:29 | v7 | ci + fetch 超时 | 挂死 |
| 06:34 | v4（回滚） | install | 挂死 |

**成功和失败的第一对运行，runner 镜像版本、Node 版本完全相同**（同一镜像 `20260720.247.2`、同一 Node 22.23.1）。这说明问题既不在 action 版本，也不在 npm 的子命令，而在别的地方。

## 根因

转机来自一个偶然看到的现象：Action 页面的转圈日志里，闪过几行**公司内网 npm registry 的域名**。GitHub 的 runner 为什么会去访问我公司内网仓库？

检查 lockfile：

```text
$ grep -o '"resolved": "https\?://[^/"]*' package-lock.json | sort | uniq -c
 208 "resolved": "https://registry.npmmirror.com
  96 "resolved": "https://npm.internal.example.com
```

96 个包的下载地址指向公司内网 registry（本文已脱敏为 `npm.internal.example.com`）。再对比挂死前最后一次成功部署的 lockfile，304 个包**全部**是 `registry.npmmirror.com`。时间线完全对上：卡死正是从那 96 条内网 URL 进入 lockfile 的提交开始的。

为了拿到证据，专门起了一个诊断运行：`timeout 300` 兜底、`--loglevel=http` 打印每个请求、失败后转储 npm debug 日志：

```text
http fetch GET https://npm.internal.example.com/unist-util-is/-/unist-util-is-6.0.1.tgz attempt 3 failed with ETIMEDOUT
http fetch GET https://npm.internal.example.com/web-namespaces/-/web-namespaces-2.0.1.tgz attempt 3 failed with ETIMEDOUT
...（几十个包，全部 ETIMEDOUT）
```

一句话：**`package-lock.json` 的 `resolved` 字段记录的是安装时使用的 registry 地址，我在公司网络下执行 `npm update`，lockfile 就把内网地址带进了仓库；CI 上的 npm 也使用这份 package-lock，去连一个它根本到不了的地址。**

两个机制放大了症状：

1. **npm 没有请求级超时**。TCP 连接对端不可达时，npm 不会快速失败，而是挂起重试。默认日志级别下挂起的请求一行都不打印，所以页面上是"一切正常但永远不走"。（这个行为在 npm 官方 issue 里挂了几年了：npm/cli#7657、#8294、#9386。）
2. **`Exit handler never called!` 只是表象不是根因**。npm 最终异常退出时，退出路径上的另一个 bug 把真实错误吞掉了，只留下这句指向 npm 自己的废话，把排查方向带偏到"npm/action/Node 版本"上。

## 修复

1. 把 lockfile 里的内网地址统一改写为公共镜像（包内容相同，integrity 哈希不变，本地 `npm ci` 验证通过）：

2. **防复发**：仓库根目录加项目级 `.npmrc`，固定 registry。这样不管在哪台机器、哪个网络环境下安装依赖，写进 lockfile 的都是公网可达的地址：

   ```text
   registry=https://registry.npmmirror.com
   ```

push 后部署 42 秒跑完。
