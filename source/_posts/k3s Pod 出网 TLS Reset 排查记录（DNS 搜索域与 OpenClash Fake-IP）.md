---
title: "k3s Pod 出网 TLS Reset 排查记录：DNS 搜索域与 OpenClash Fake-IP"
tags: HomeLab
categories: HomeLab
date: 2026-07-26 12:08:00
---

# k3s Pod 出网 TLS Reset 排查记录：DNS 搜索域与 OpenClash Fake-IP

**日期：** 2026-07-26

**环境：** HomeLab Ubuntu VM（192.168.31.119），k3s v1.36.2 与 Docker 共存；网关 OpenWrt 跑 OpenClash（fake-ip 模式，198.18.0.0/16）

## 背景

周末把个人项目 PaperMind（Go 后端 + React 前端 + PostgreSQL + Redis）整体迁移到了 HomeLab 的 k3s 上。部署本身很顺利，四个 Pod 全部 Running，前端页面也能打开——直到做功能联调：上传论文"处理失败"，AI 对话也没响应。

这是同一套 OpenClash fake-ip 环境的第二次踩坑。前一次是局域网域名劫持（见《OpenClash Fake-IP 劫持与 dnsmasq 主机名映射冲突排查记录》），这一次的故事更精彩：嫌疑人换了好几轮，真凶是一个谁都没正眼瞧过的 DNS 搜索域。

## 故障现象

后端日志显示链路前两步完全正常：

```text
论文 d8845d12-... 解析完成，识别出 18 个章节
论文 d8845d12-... 切片完成，共 18 个 chunks
论文 d8845d12-... Embedding 失败: 请求 Embedding API 失败:
  Post "https://dashscope.aliyuncs.com/api/v1/services/embeddings/...": EOF
```

上传、PDF 解析、切片、写库全部成功，死在最后一步：调用阿里云 dashscope 的 Embedding API 时 TCP 连接被掐（EOF）。AI 对话同样依赖 dashscope 出站，一起瘫痪。

## 排查过程

### Pod 内实测：TLS 全断，但 TCP 握手能通

```bash
kubectl -n papermind exec deploy/papermind -- sh -c \
  'wget -q -O /dev/null -T 10 https://dashscope.aliyuncs.com'
# SSL_connect: Connection reset by peer（3/3 复现）
```

Pod 内访问 dashscope、aliyun.com 全部 TLS reset；但 `nc -z <IP> 443` 能通——**TCP 握手成功，一发 TLS ClientHello 就断**。

### 对照实验

第一反应是 OpenClash fake-ip 劫持。但控制变量之后发现事情没那么简单：

| 出口路径 | dashscope（国内直连） | google（走代理） |
|---|---|---|
| 宿主机 | ✅ | ✅ |
| Docker 容器（docker0 NAT） | ✅ | ✅ |
| k3s Pod + `hostNetwork: true` | ✅ | ✅ |
| **k3s 普通 Pod（cni0 NAT）** | ❌ TLS reset | ❌ TLS reset |

**OpenClash 代理路径本身是好的**——Docker 容器同样经过 OpenClash，连 google 的 fake-ip 代理都通了，唯独 cni0 这一条路径死。问题被压缩到"k3s Pod 网络"上。

### 转折：同一域名，解析结果反复横跳

排查中注意到一个怪现象：Pod 里多次解析 `dashscope.aliyuncs.com`，**有时拿到真实 IP，有时拿到 fake-ip（198.18.x.x）**。这就是故障"时好时坏"的来源——部署时验证"Pod 可达 dashscope"能通过、联调时又挂掉。

查宿主机 DNS：

```bash
resolvectl dns ens18
# Link 2 (ens18): 192.168.31.2  8.8.8.8  192.168.31.1   ← 三个上游！
```

根源在 netplan：`dhcp4: true` 与静态配置并存——静态写了两个 DNS（192.168.31.2、8.8.8.8），DHCP 又从路由器领来一个（192.168.31.1）。三个上游由 systemd-resolved 轮流命中：问 OpenClash（.2）得 fake-ip，问 .1 / 8.8.8.8 得真实 IP。

把 netplan 改成 `dhcp4: false`、DNS 只留 192.168.31.2 之后，发现 `/etc/resolv.conf` 里的 **`search lan` 也消失了**（它来自 DHCP 的域名选项）。用新建的 Pod 复测——dashscope ✅、google ✅，**全通**。

真凶就是这个 `lan` 搜索域。

## 根因详解：`lan` 搜索域

每一环单看都合理，放一起就是坑：

1. **路由器 DHCP 应答**：除了 IP 还带"本地域名"选项（OpenWrt/路由器默认就是 `lan`）。
2. **systemd-resolved**：把 `lan` 写进宿主机 `/etc/resolv.conf` 的 `search lan`。
3. **kubelet 创建 Pod 时原样继承宿主搜索域**：

   ```text
   search papermind.svc.cluster.local svc.cluster.local cluster.local lan
   options ndots:5
   ```

4. **Pod 内解析外部域名被搜索域拦截**：`ndots:5` 规则——点号少于 5 个的域名**先**拼搜索域逐个试。`dashscope.aliyuncs.com`（3 个点）依次试：

   ```text
   dashscope.aliyuncs.com.papermind.svc.cluster.local  → NXDOMAIN
   dashscope.aliyuncs.com.svc.cluster.local            → NXDOMAIN
   dashscope.aliyuncs.com.cluster.local                → NXDOMAIN
   dashscope.aliyuncs.com.lan                          → ← 被"答"了，搜索停在这
   ```

5. **fake-ip 永远不会回 NXDOMAIN**：正常 DNS 对 `....lan` 这种不存在的名字会回 NXDOMAIN，解析器收到 NXDOMAIN 才会继续试绝对域名；但 mihomo fake-ip 模式下，凡匹配不到 DIRECT 规则的名字一律回 198.18.x.x 假 IP——有问必答，搜索域流程因此提前终结。Pod 拿到毒答案去连，OpenClash 反查 fake-ip 映射表，发现对应的是 `dashscope.aliyuncs.com.lan` 这个不存在的域名 → 掐断连接 → 应用看到 EOF/RST。

PS: .cluster.local 不会被 OpenClash 拦截是因为，.cluster.local 这种域名都在 k8s 集群内处理，直接就响应了，不会交给 OpenClash

- **为什么只有 k3s Pod 中招**：Docker 容器和宿主机的 resolv.conf 没有 `ndots:5`（默认 `ndots:1`），`dashscope.aliyuncs.com` 有 3 个点 ≥ 1，第一次就查绝对域名，完全绕开搜索域流程。
- **为什么 `nc -z` 能通**：透明代理会自己代答 SYN，握手看起来成功，等真实数据（TLS ClientHello）进来、需要反查域名映射时才露馅。**TCP 通 ≠ 应用层通**。
- **为什么时好时坏**：DNS 三上游随机期间，某些查询恰好走了干净的链路就能通。

## 修复

```bash
# 1. netplan：关 DHCP、DNS 固定为 192.168.31.2
#    （dhcp4: false，nameservers 只留 OpenWrt）
sudo netplan apply

# 2. 防止 cloud-init 重启后重新生成网络配置
echo 'network: {config: disabled}' | sudo tee /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg

# 3. 重建 Pod（resolv.conf 是 Pod 创建时生成的，不重建不生效）
kubectl -n papermind rollout restart deploy/papermind
```
