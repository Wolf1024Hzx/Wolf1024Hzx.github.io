---
title: 云服务器 ssh.socket 按需启动 ssh 服务故障排查记录
tags: HomeLab
categories: HomeLab
date: 2026-04-07
---
**环境**：阿里云ECS，Ubuntu 24.04.2 LTS，SSH端口已改为2022（之前使用 ssh.socket 监听 2022 端口，有请求才唤起 ssh 服务） 

**现象**： 
- 之前都是能连接的
- 今天本地SSH客户端连接报错：`由于目标计算机积极拒绝，无法连接。(os error 10061)` 
- 客户端显示：`Agent auth selected, but no running Agent process is found` 
- 确认阿里云安全组已放行2022端口 
- 可以通过阿里云救援模式登录服务器 

--- 

## 第一阶段：救援模式下的初步排查 

### 尝试1：确认系统环境与SSH服务状态 

**执行命令**： 

```bash 
systemctl list-unit-files | grep -i ssh 
dpkg -l | grep openssh-server 
``` 

**观察到的现象**： 

- SSH 相关状态：`ssh.service` (disabled)、`ssh.socket` (enabled) 
- `openssh-server` 包已正常安装 

**初步分析**： 
- 就是使用了 systemd 的 **socket 按需启动机制**（`ssh.socket` 监听端口，有连接时才启动 `ssh.service`） 
- 未启用常驻的 `ssh.service` 

--- 

## 第二阶段：发现socket按需启动机制 

### 尝试2：检查ssh.socket状态与端口监听 

**执行命令**： 

```bash 
systemctl status ssh.socket 
ss -tulnp | grep 2022 
``` 

**观察到的现象**： 
- `ssh.socket` 状态：`active (listening)` 
- 端口监听仅显示：`[::]:2022`（**仅监听IPv6，未监听IPv4**） 
- 无 `0.0.0.0:2022` 的IPv4监听记录 **核心根因初步判断**： 绝大多数公网SSH连接走IPv4，服务器未在IPv4上监听2022端口，导致连接被直接拒绝（`os error 10061`）。 

--- 

## 第三阶段：修复socket配置的尝试与报错 

### 尝试3：修改ssh.socket配置，添加IPv4监听 

**操作**： 编辑 `/etc/systemd/system/ssh.socket.d/override.conf`，添加： 

```ini 
[Socket] 
ListenStream= 
ListenStream=0.0.0.0:2022 
ListenStream=[::]:2022 
Accept=yes # 此处为后续报错埋下隐患 
``` 

**执行命令**： 

```bash 
sudo systemctl daemon-reload 
sudo systemctl restart ssh.socket 
ss -tulnp | grep 2022 
``` 

**观察到的现象**： 
- 端口监听正常：同时显示 `0.0.0.0:2022` 和 `[::]:2022` 
- `ssh.socket` 状态仍为 `active (listening)` 
- **但本地客户端仍无法连接** 

### 尝试4：切换到常驻模式验证SSH服务本身 

**操作**： 临时关闭socket模式，启动常驻 `ssh.service`： 

```bash 
sudo systemctl stop ssh.socket 
sudo systemctl disable ssh.socket 
sudo sshd -t # 检查配置语法 
``` 

**观察到的现象**： 
- `sshd -t` 报错：`Missing privilege separation directory: /run/sshd` 

- 忽略报错，强制启动 `ssh.service`： 

```bash 
sudo systemctl start ssh 
sudo systemctl enable ssh 
ss -tulnp | grep 2022 
``` 

- 端口监听正常，**本地客户端成功连接** 

**结论**： SSH服务本身、端口、防火墙、安全组均正常，问题出在socket按需启动的配置上。 

### 尝试5：查看socket模式的历史报错日志 

**执行命令**： 

```bash 
sudo journalctl -u ssh.socket -u ssh.service --since today | grep -i 'error\|fail\|warn' 
``` 

**观察到的报错**： 
1. `ssh.socket: Failed to set socket on service: Invalid argument` 
2. `ssh.socket: Failed with result 'resources'` 
3. `dispatch_protocol_error: type 80 seq 3 [preauth]` 

**原因定位**： 
- **报错**：`Accept=yes` 是「单连接单实例」模式，要求配套 `ssh@.service` 模板，但Ubuntu默认无此模板，导致systemd无法将连接传递给sshd，直接拒绝。 
- **客户端报错**：`protocol_error` 是本地SSH Agent未运行导致，与服务器无关。 
- 暂时没看到其他报错，所以**无法分析出为什么之前能连，今天突然连不上**

--- 

## 第四阶段：暂时解决方案 

### 使用常驻ssh.service模式

**执行命令**： 

```bash 
# 彻底屏蔽socket模式，避免冲突 
sudo systemctl stop ssh.socket 
sudo systemctl disable ssh.socket 
sudo systemctl mask ssh.socket 

# 启用常驻ssh.service，设置开机自启 
sudo systemctl unmask ssh 
sudo systemctl enable --now ssh
systemctl status ssh ss -tulnp | grep 2022 
``` 

**结果**： 
- `ssh.service` 状态：`active (running)` 
- 端口监听正常：`0.0.0.0:2022` 和 `[::]:2022` 
- 本地客户端成功连接，问题暂时解决。 

---