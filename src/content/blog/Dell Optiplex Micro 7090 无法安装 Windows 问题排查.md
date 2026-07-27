---
title: Dell Optiplex Micro 7090 无法安装 Windows 问题排查
tags: HomeLab
categories: HomeLab
date: 2026-03-21 16:29
---
**问题：** 实验室的迷你主机 Dell Optiplex Micro 7090 无法安装 Windows，但是可以安装 Linux。安装 Windows 的时候，系统 U 盘尝试将操作系统写入硬盘时，会没有任何硬盘可选。

---

## 异常现象描述

在 Dell Optiplex Micro 7090 迷你主机上尝试安装 Windows 操作系统时，系统安装程序进入到选择硬盘的步骤时，列表为空，无法识别到任何本地硬盘。相反，如果使用 Ubuntu 启动盘进行安装，则可以正常识别到硬盘并顺利完成系统安装。

## 原理分析

出现该问题的原因在于操作系统的底层驱动支持差异：

- **Windows 侧**：企业级设备在 BIOS 中会默认开启硬件 RAID 模式，该模式通常使用 Intel VMD (Volume Management Device) 技术来统一接管所有的 SATA 和 NVMe 硬盘。然而，微软官方的 Windows 启动盘中并没有默认集成 VMD 的驱动程序，导致在安装阶段无法读取被 VMD 接管的硬盘设备。
    
- **Linux 侧**：Linux 内核早在 2018 年就已经在主线中内置了对 Intel VMD 的支持，因此 Ubuntu 等主流 Linux 发行版的安装程序能够直接识别出处于 VMD/RAID 模式下的硬盘，不会遇到此 Bug。
    

## 原因定位

主板 BIOS 默认开启了基于 VMD 的 RAID 模式，而 Windows 官方原版安装镜像缺乏对应的 VMD 存储驱动，导致安装程序"看"不到硬盘。哪怕设备中只有单块硬盘，企业级主机也可能默认启用此配置。

## 解决方案

无需手动往 Windows 安装盘中注入 VMD 驱动，最简单的处理方式是直接更改 BIOS 的硬盘模式：

1. 重启主机并进入 BIOS 设置界面。
    
2. 寻找到存储设置（Storage）或硬盘配置选项。
    
3. 将默认开启的 **RAID 模式** 关闭。
    
4. 将硬盘工作模式切换为标准的 **AHCI** 模式。
    
5. 保存 BIOS 设置并重启设备。
    

再次使用 Windows U 盘引导安装时，系统即可正常识别到硬盘。