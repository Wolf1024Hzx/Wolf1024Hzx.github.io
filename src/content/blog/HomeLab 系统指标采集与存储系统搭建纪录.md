---
title: HomeLab 系统指标采集与存储系统搭建纪录
tags: HomeLab
categories: HomeLab
date: 2026-06-07
---

**日期：** 2026-06-07

**目标**：在 HomeLab 各台机器上每分钟采集系统指标（CPU、内存、磁盘、网络、温度等），统一写入 MySQL 数据库，为后续监控和告警打基础。

---

## 系统架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Windows 笔记本  │     │   PVE 宿主机     │     │  Ubuntu Server  │
│  (采集脚本)      │     │   (采集脚本)     │     │   (采集脚本)     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │ HTTP POST /metrics
                                 ▼
                    ┌────────────────────────┐
                    │   FastAPI 后端服务      │
                    │   (Docker 容器)         │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │   MySQL 数据库          │
                    └────────────────────────┘
```

- **后端服务**：FastAPI 应用，Docker 容器部署，提供 `POST /metrics` 接口
- **采集脚本**：Python 脚本，使用 psutil 采集系统指标，每分钟 HTTP POST 到后端
- **数据库**：已有的 MySQL 实例

## 采集的指标

| 类别 | 指标 |
|------|------|
| 标识 | hostname、MAC 地址、IP 地址、操作系统 |
| CPU | 利用率、物理核数、逻辑核数 |
| 内存 | 总容量、已用容量、使用率 |
| 磁盘 | 总容量、已用容量、使用率 |
| 网络 | 发送字节数、接收字节数 |
| 系统 | 运行时间、1 分钟负载均值、进程数 |
| 温度 | CPU 各核心温度（Windows 上通常不可用） |
| 扩展 | 预留 JSON 字段，后续新增指标不需要改表结构 |

## 数据库设计

### machines 表 — 机器注册信息

| 列名 | 类型 | 说明 |
|------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| hostname | VARCHAR(255) | 主机名 |
| mac_address | VARCHAR(17) | 主 MAC 地址 |
| ip_address | VARCHAR(45) | IP 地址 |
| os_info | VARCHAR(255) | 操作系统信息 |
| created_at | DATETIME | 首次上报时间 |

通过 `hostname + mac_address` 唯一标识一台机器。首次上报时自动注册，后续上报时更新可能变化的 IP 和 OS 信息。

### metrics 表 — 采集指标数据

| 列名 | 类型 | 说明 |
|------|------|------|
| id | BIGINT AUTO_INCREMENT | 主键 |
| machine_id | INT | 关联 machines 表 |
| collected_at | DATETIME | 采集时间 |
| cpu_utilization | FLOAT | CPU 利用率 (%) |
| cpu_count_physical | INT | 物理核数 |
| cpu_count_logical | INT | 逻辑核数 |
| memory_total_gb | FLOAT | 总内存 (GB) |
| memory_used_gb | FLOAT | 已用内存 (GB) |
| memory_utilization | FLOAT | 内存使用率 (%) |
| disk_total_gb | FLOAT | 磁盘总容量 (GB) |
| disk_used_gb | FLOAT | 磁盘已用容量 (GB) |
| disk_utilization | FLOAT | 磁盘使用率 (%) |
| network_bytes_sent | BIGINT | 网络发送字节数 |
| network_bytes_recv | BIGINT | 网络接收字节数 |
| system_uptime_seconds | BIGINT | 系统运行时间（秒） |
| load_avg_1m | FLOAT | 1 分钟负载均值 |
| process_count | INT | 进程数 |
| cpu_temperatures | JSON | CPU 各核心温度 |
| extra | JSON | 扩展指标 |

每条记录完整保留，不做聚合或删除。

## 部署纪录

### 后端服务（Docker）

在 Ubuntu Server 上：

```bash
cd ~/ETL-Backend
cp .env.example .env
# 编辑 .env 填入 MySQL 连接信息
docker compose up -d --build
```

服务运行在 8000 端口，访问 `http://<服务器IP>:8000/docs` 可查看 API 文档。

### 采集脚本 — Linux（PVE 宿主机、Ubuntu Server、存储节点）

```bash
mkdir -p ~/collector
cd ~/collector
python3 -m venv .venv
source .venv/bin/activate
pip install psutil==7.0.0 requests==2.32.3
# 将 collect.py 放到此目录
deactivate

# 添加 cron 任务
crontab -e
# 添加以下行：
* * * * * /home/wolf/collector/.venv/bin/python3 /home/wolf/collector/collect.py
```

用 `.venv/bin/python3` 的完整路径，cron 执行时自动使用虚拟环境的 Python，不需要 activate。

### 采集脚本 — Windows

```bash
pip install psutil requests
python collector/collect.py   # 手动测试一次
```

设置 Windows 定时任务：使用 `pythonw.exe` 替代 `python.exe`，避免每分钟弹出命令行窗口。

### 采集脚本 — OpenWrt

**不建议在 OpenWrt 上运行采集脚本**。OpenWrt 是精简的嵌入式系统，作为网关应尽量保持轻量，不建议安装 Python 环境。

## 注意事项

- 采集脚本必须裸跑在被监控的机器上，不能放 Docker 容器里——否则采集到的是容器的指标，不是宿主机的
- `pythonw.exe` 运行脚本不会弹出窗口，适合 Windows 定时任务
- MySQL 配置通过 `.env` 文件读取，不会写死在代码中
- 每分钟采集一次对系统影响极小，脚本运行约 1-2 秒后即退出，不会常驻内存
