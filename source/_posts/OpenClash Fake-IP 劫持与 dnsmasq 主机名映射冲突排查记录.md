---
title: OpenClash Fake-IP 劫持与 dnsmasq 主机名映射冲突排查记录
tags: HomeLab
categories: HomeLab
date: 2026-07-23 23:22:44
---

# OpenClash Fake-IP 劫持与 dnsmasq 主机名映射冲突排查记录

**日期：** 2026-07-23

## 背景

HomeLab 网络架构（详见《HomeLab 配置》《HomeLab 内网 HTTPS 无感访问配置纪录》）：

- 小米路由器（192.168.31.1）下发 DHCP，DNS 指向 OpenWrt 旁路由（192.168.31.2）。
- OpenWrt 的 dnsmasq 配置了 `*.wolfden.website` 部分子域名的主机名映射，指向 Ubuntu 服务节点（192.168.31.119）上的 Nginx Proxy Manager。
- OpenWrt 上跑 OpenClash（Mihomo 内核，TUN + Fake-IP 模式），白名单内只有 Ubuntu 服务节点一台设备——它的外网流量走代理，其余局域网设备直连。

## 现象

在 Ubuntu 服务节点上排查 k3s 部署前置环境时发现：

```bash
dig +short git.wolfden.website
# 返回 198.18.0.26，而不是主机名映射里的 192.168.31.119
```

`198.18.0.0/15` 是 Clash/Mihomo Fake-IP 的常用地址段。同时 `curl -sI https://git.wolfden.website` 直接失败。

但局域网内其他设备（手机、电脑）用域名访问同样的服务完全正常。

## 两个假设

- **假设 A**：`git.wolfden.website` 不在 OpenWrt 的主机名映射里（漏配），查询被转发给 OpenClash，返回了 Fake-IP。
- **假设 B**：OpenClash 对白名单设备的 DNS 劫持发生在 dnsmasq 主机名映射**之前**——即使配了映射，白名单设备拿到的也是 Fake-IP。

## 排查过程与证据

### 1. dig 现象矩阵（@192.168.31.2，OpenWrt）

| 域名 | 返回 IP | TTL | 判定 |
| ---- | ---- | ---- | ---- |
| git.wolfden.website | 198.18.0.26 | 1 | fake-ip |
| homepage.wolfden.website（**已配映射**） | 198.18.0.36 | 1 | fake-ip |
| test123.wolfden.website（肯定没配） | 198.18.0.37 | 1 | fake-ip |
| wolfden.website（apex） | 198.18.0.38 | 1 | fake-ip |

关键细节：**所有 Fake-IP 应答的 TTL 均为 1**，这是 Mihomo Fake-IP 的招牌特征（dnsmasq 本地映射通常 TTL 0，公网解析一般几百上千）。

### 2. 对照组（@192.168.31.1，小米路由器）

- 各子域名：`NXDOMAIN`（公网本无记录，正常）。
- apex：正常公网解析（TTL 600）。

说明问题只出在 OpenWrt 的劫持链路，与上级无关。

### 3. 行为验证

```bash
curl -sv https://git.wolfden.website
# TCP Connected to 198.18.0.26:443 ... SSL_ERROR_SYSCALL (35)

ip route get 198.18.0.26
# via 192.168.31.2
```

连接被路由到 OpenWrt 并由 Mihomo 接管：Mihomo 拿 Fake-IP 反查域名后尝试解析/连接 `git.wolfden.website`，但该名字在公网是 NXDOMAIN，而这台机器在白名单里——链路两头都断，握手被掐死。

## 结论：假设 B 成立

决定性证据是 `homepage.wolfden.website`——它是**明确配过主机名映射**的域名，照样返回 TTL=1 的 Fake-IP。四个名字无一例外，与"漏配"无关。

也就是说，对这台白名单设备，查询根本没走到 dnsmasq 的主机名映射逻辑：**OpenClash 的 DNS 劫持（53 端口重定向到 Mihomo 的 DNS，或 dnsmasq 上游被整体指向 Mihomo）发生在映射匹配之前**。

而其他设备正常，恰恰因为它们**不在白名单里**：白名单外的设备 DNS 走 dnsmasq 正常流程，映射生效拿到 192.168.31.119。全局域网只有白名单内这台 VM 域名访问是坏的。

### 白名单悖论

本质是一个设计时就埋下的矛盾：这台 VM 既要走代理访问外网（DNS 必须被 Mihomo 接管），又要直连内网域名（需要 dnsmasq 映射生效）——两个需求在同一个 DNS 链路上互斥，代理赢了，内网域名就输了。

## 决策：不修复

备选修法（Mihomo 自定义 `hosts`，或 `fake-ip-filter` + `nameserver-policy` 指回 dnsmasq 实际端口）都可行，但都要在 Clash 里把内网域名映射**再维护一份**，与 OpenWrt 主机名映射形成两处配置，必然漂移——这次的 bug 本来就是"两套 DNS 逻辑打架"造成的，再用双处配置去修它，是拿病因当药方。

最终决定：**不修，维持"VM 上用 IP"规则**：

- 在这台 VM 上访问本机服务，一律使用 `127.0.0.1:端口` 或 `192.168.31.119:端口`，不使用 `*.wolfden.website` 域名；k3s Pod 访问本机依赖同理。
- 域名解析是给白名单以外的内网设备用的。

## 附带收获

这个结论顺便解释了 2026-06 的一个悬案：当时给 Gitea act_runner 注册实例，`--instance https://git.wolfden.website` 报 "Cannot ping the Gitea instance server"，改用 `http://127.0.0.1:3001` 立刻成功。当时归因于 NPM 对 RPC 接口的兼容性问题，现在看更可能就是 Fake-IP——域名解析成了 198.18.x.x，流量根本回不到本机。

## 经验总结

1. **Fake-IP 的指纹是 TTL=1**： dig 排查代理环境 DNS 问题时，先看 TTL，一眼区分真解析和劫持。
2. **白名单/劫持类配置是有作用域顺序的**：配 OpenClash 白名单时以为只是"允许走代理"，实际连 DNS 解析权也一并交出去了。
