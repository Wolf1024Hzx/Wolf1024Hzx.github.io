---
title: Jellyfin 内网高速下载导致 PVE 宿主机网卡崩溃 (Tx Unit Hang)
tags: HomeLab
categories: HomeLab
date: 2026-04-20 12:52
---
**问题：** 迷你主机在千兆内网环境下，通过 Jellyfin 下载大体积视频文件时网卡崩溃断网。
**环境：** HP EliteDesk 800 G4 DM (Intel I219-LM 千兆网卡 / `e1000e` 驱动)，底层为 PVE 虚拟化系统。

---

## 异常现象描述

从虚拟机内的 Jellyfin 下载大约 1GB 左右的数据后，宿主机（PVE）网络突然断开。此时不仅虚拟机全部断网，宿主机的 SSH 也无法连接，整机处于离线状态，只能通过物理按键强制硬重启。外接显示器查看系统底层日志，看见 `NETDEV WATCHDOG: transmit queue timed out` 和 `detected Tx Unit Hang` 报错。

## 原理分析

现代操作系统为了减轻 CPU 的计算压力，默认会开启**硬件卸载（Hardware Offloading）**技术（如 TSO：TCP 分段卸载，GSO：通用分段卸载）。

在理想状态下，系统不会在软件层面将庞大的数据块切分成标准的网络小包（MTU 1500 字节），而是直接把巨大的“数据块”全部扔给物理网卡，让网卡硬件去完成切分工作。

## 原因定位

**结论：消费级网卡在处理高并发硬件卸载任务时存在瓶颈，导致网卡芯片高负载卡死。**

在千兆内网高速传输大文件时，大量巨大的数据包瞬间涌入物理网卡。PVE 偷懒没有切分数据包，而是将“切分”的压力全部抛给了消费级物理网卡。Intel `e1000e` 驱动管辖下的消费级网卡芯片在处理这种突发性高的高并发切分任务时，超出了其处理极限（或触发了固件 Bug），最终导致网卡硬件直接 Panic。

## 解决方案

通过关闭网卡的硬件卸载功能，强迫 PVE 利用宿主机 CPU 提前在软件层面上把大块数据“切分”成无数个标准的网络小包，再交由物理网卡进行纯粹的转发。

1. **查找物理网卡名称**
   在 PVE 宿主机的终端内执行命令，确认真实的物理网卡名称（通常为 `eno1`、`enp0s31f6` 或 `eth0`）：
   ```bash
   ip a
   ```

2. **临时关闭硬件卸载（验证修复）**
   使用 `ethtool` 工具临时强制关闭 TSO、GSO 和 GRO 功能（这里假设物理网卡名称为 `eno1`）：
   ```bash
   ethtool -K eno1 tso off gso off gro off
   ```
   执行完成后，再次尝试在内网从 Jellyfin 下载大文件。确认网卡不再崩溃宕机。

3. **固化配置（永久生效）**
   由于 `ethtool` 命令会在重启后失效，需要将其写死在 PVE 的网络配置文件中。编辑 `/etc/network/interfaces` 文件，在物理网卡配置下加一行 `post-up` 钩子指令：
   ```text
   auto eno1
   iface eno1 inet manual
       post-up /sbin/ethtool -K eno1 tso off gso off gro off
   ```

---