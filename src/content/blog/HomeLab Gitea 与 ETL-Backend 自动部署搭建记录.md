---
title: HomeLab Gitea 与 ETL-Backend 自动部署搭建记录
tags: HomeLab
categories: HomeLab
date: 2026-06-07
---
**目标：** 为 `ETL-Backend` 搭建一个局域网内自用的代码仓库和自动部署链路，避免每次在笔记本上修改代码后，还要手动复制到 Ubuntu Server，再手动执行 Docker Compose 重新部署。

---

## 背景

此前已经完成了 HomeLab 系统指标采集与存储系统：

- 各台机器运行 `collector/collect.py`，每分钟采集 CPU、内存、磁盘、网络、温度等指标。
- 采集脚本通过 HTTP POST 调用后端 `POST /metrics`。
- 后端是 FastAPI 应用，运行在 Ubuntu Server 的 Docker 容器里。
- 后端将数据写入 MySQL 的 `machines` 和 `metrics` 表。

现有部署方式比较朴素：

```bash
cd ~/ETL-Backend
docker compose up -d --build
```

这个方式对初始搭建足够，但日常开发时会变得麻烦：

1. 在 Windows 笔记本上改代码。
2. 手动复制项目目录到 Ubuntu Server。
3. 登录 Ubuntu Server。
4. 手动执行 `docker compose up -d --build`。
5. 手动确认服务是否启动。

这套流程的问题不是复杂，而是重复且容易忘步骤。尤其是 ETL-Backend 后续还可能继续加接口、监控、告警或数据查询页面，如果每次都靠手动复制，很快会变成维护负担。

---

## HomeLab 环境上下文

参考既有文档：

- `HomeLab 配置.md`
- `HomeLab 系统指标采集与存储系统搭建纪录.md`
- `HomeLab 内网 HTTPS 无感访问配置纪录.md`

当前相关环境如下。

### 网络与主机

| 角色 | 地址/说明 |
|---|---|
| 小米路由器 | `192.168.31.1` |
| OpenWrt | `192.168.31.2`，作为局域网 DNS，并配置 `*.wolfden.website` 的内网解析 |
| Ubuntu Server | `192.168.31.119`，HomeLab 服务节点，运行 Docker、Nginx Proxy Manager、Jellyfin 等容器 |
| PVE 宿主机 | `192.168.31.200` |
| 域名 | `wolfden.website` |
| Gitea 入口 | `git.wolfden.website` |

### 内网 HTTPS 体系

HomeLab 已经有一套内网 HTTPS 访问方式：

1. 真实域名 `wolfden.website` 托管在阿里云。
2. Nginx Proxy Manager 通过 DNS Challenge 申请 `*.wolfden.website` 泛域名证书。
3. OpenWrt 将局域网内指定子域名解析到 Ubuntu Server `192.168.31.119`。
4. Nginx Proxy Manager 将这些域名反向代理到对应容器端口。

因此，Gitea 适合接入为：

```text
git.wolfden.website
        ↓
OpenWrt 内网 DNS
        ↓
192.168.31.119
        ↓
Nginx Proxy Manager
        ↓
Gitea 容器
```

### ETL-Backend 原始服务

`ETL-Backend` 项目内容：

```text
app/
  database.py
  main.py
  models.py
  schemas.py
collector/
  collect.py
Dockerfile
docker-compose.yml
requirements.txt
README.md
```

后端服务通过 Docker 暴露：

```yaml
ports:
  - "8990:8000"
```

也就是说：

```text
容器内 FastAPI：8000
宿主机访问端口：8990
```

---

## 最初的想法

一开始的需求很明确：

> 我这台笔记本上一改代码，就要手动复制到 Ubuntu 虚拟机上，重新 docker compose up -d。我希望在虚拟机上有个自己的代码仓库，可以 push 进去。然后还要 CI/CD，这个项目一 push，就自动重新部署。

约束条件：

- 只在局域网内使用。
- 不需要公网 Git 服务。
- 希望保留 HomeLab 自主可控的风格。
- 最终目标是 `git push` 后自动部署。

---

## 方案讨论过程

### 方案一：bare Git 仓库 + post-receive hook

最开始讨论的是 bare Git 仓库。

bare Git 是 Git 官方支持的服务端仓库形态，只有 Git 元数据，没有工作区文件。例如：

```text
/home/wolf/git/ETL-Backend.git
  objects/
  refs/
  hooks/
```

典型流程：

```text
Windows 笔记本
  git push homelab main
        ↓
Ubuntu bare repo 收到 push
        ↓
post-receive hook 被触发
        ↓
更新部署目录
        ↓
docker compose up -d --build
```

优点：

- 极轻量。
- 不需要额外服务。
- SSH + Git + Docker 就能完成。
- 非常适合单人局域网使用。

缺点：

- 没有 Web 页面。
- 没有多仓库管理界面。
- 没有 Actions、Issue、Release 等功能。
- 后续多个项目时，可管理性一般。

结论：

这是最简单可靠的方案，但更像一个脚本化部署工具，不像一个 HomeLab 代码中心。

### 方案二：Gitea + Webhook

Gitea 作为 Git 服务，push 后通过 webhook 调用一个本地部署脚本。

优点：

- 有 Git Web 页面。
- 可以管理多个仓库。
- 自动部署逻辑可以完全绕开 Gitea Actions runner。
- 比 Actions runner 简单。

缺点：

- 需要一个 webhook receiver。
- webhook receiver 自身也要部署和守护。
- 没有 Actions 的流水线页面。

结论：

如果只是要自动部署，这会是后续最稳的替代方案。

### 方案三：Gitea + Actions runner

最终选择的是这个方案。

理想架构：

```text
Windows 笔记本
  git push
        ↓
Gitea 仓库
        ↓
Gitea Actions
        ↓
Ubuntu 宿主机 act_runner
        ↓
同步代码、构建镜像、重启容器
```

优点：

- Gitea 是完整的局域网 Git 服务。
- 有 Web 页面、仓库管理、SSH push、Actions 页面。
- 后续多个项目也能复用。
- 比 bare Git 更像"自己的 GitHub 小平替"。

缺点：

- runner 比 bare Git hook 更复杂。
- runner 需要 Docker 权限。
- Gitea Actions 生态和 GitHub Actions 相似但不完全一致。
- 实际踩到了 runner 状态回写异常。

结论：

当时从 HomeLab 长期维护角度看，选择 Gitea + Actions runner 是合理的。

---

## Gitea 部署

### Docker Compose 配置

Gitea 部署在 Ubuntu Server 上，用户后来将宿主机 Web 端口改为 `3001`，避免和其他服务冲突。

最终形式大致如下：

```yaml
services:
  gitea:
    image: docker.gitea.com/gitea:1.26.2
    container_name: gitea
    environment:
      - USER_UID=1000
      - USER_GID=1000
      - GITEA__server__DOMAIN=git.wolfden.website
      - GITEA__server__ROOT_URL=https://git.wolfden.website/
      - GITEA__server__SSH_DOMAIN=git.wolfden.website
      - GITEA__server__SSH_PORT=2222
      - GITEA__server__SSH_LISTEN_PORT=22
      - GITEA__actions__ENABLED=true
      - GITEA__service__DISABLE_REGISTRATION=true
    restart: unless-stopped
    volumes:
      - ./gitea:/data
      - /etc/timezone:/etc/timezone:ro
      - /etc/localtime:/etc/localtime:ro
    ports:
      - "3001:3000"
      - "2222:22"
    deploy:
      resources:
        limits:
          memory: 6G
```

端口含义：

```text
宿主机 3001 -> Gitea 容器 3000
宿主机 2222 -> Gitea 容器 22
```

因此 Nginx Proxy Manager 应该反向代理到：

```text
Forward Hostname/IP: 192.168.31.119
Forward Port: 3001
```

Gitea 安装页面里的 HTTP 服务端口仍然填：

```text
3000
```

因为那是 Gitea 容器内部监听端口，不是宿主机映射端口。

### 安装页面里"以用户名运行：git"的解释

安装页面出现：

```text
以用户名运行：git
```

这里的 `git` 不是网页登录用户，也不是必须在 Ubuntu 宿主机创建的登录用户，而是 Gitea 容器内部运行服务的 Linux 用户。

保持默认即可。

网页登录管理员账号可以叫 `wolf`、`hezha`、`admin` 等。SSH 地址里的 `git@` 也不代表网页登录用户名，它只是 Gitea 的 SSH 传输用户。

例如：

```bash
ssh://git@git.wolfden.website:2222/wolf/ETL-Backend.git
```

其中：

```text
git@                      Gitea SSH 传输用户
wolf                      Gitea 仓库 owner
ETL-Backend.git           仓库名
```

---

## Gitea 反向代理和局域网访问

OpenWrt 中添加主机名映射：

```text
git.wolfden.website -> 192.168.31.119
```

Nginx Proxy Manager 添加 Proxy Host：

```text
Domain Names: git.wolfden.website
Forward Hostname/IP: 192.168.31.119
Forward Port: 3001
SSL Certificate: *.wolfden.website
Force SSL: enabled
```

访问：

```text
https://git.wolfden.website
```

SSH push 走：

```text
ssh://git@git.wolfden.website:2222/<用户名>/<仓库名>.git
```

---

## act_runner 安装与注册

### 创建 runner 用户

在 Ubuntu Server 上创建专门运行 runner 的用户：

```bash
sudo useradd --create-home --shell /bin/bash act_runner
sudo usermod -aG docker act_runner
```

创建目录：

```bash
sudo mkdir -p /etc/act_runner /var/lib/act_runner
sudo chown -R act_runner:act_runner /etc/act_runner /var/lib/act_runner
```

### 部署目录权限

ETL-Backend 实际部署目录为：

```text
/home/wolf/DIY-docker-compose/ETL-Backend
```

最初示例中使用的是：

```text
/srv/etl-backend
```

后来根据实际情况改为现有目录。

为了让 `act_runner` 能同步文件，需要给它部署目录写权限。

使用 ACL：

```bash
sudo setfacl -m u:act_runner:rx /home/wolf
sudo setfacl -m u:act_runner:rx /home/wolf/DIY-docker-compose
sudo setfacl -R -m u:act_runner:rwx /home/wolf/DIY-docker-compose/ETL-Backend
sudo setfacl -dR -m u:act_runner:rwx /home/wolf/DIY-docker-compose/ETL-Backend
```

后来也讨论过一个更省心的方式：

```bash
sudo chown -R act_runner:act_runner /home/wolf/DIY-docker-compose/ETL-Backend
```

因为这个目录已经变成 CI/CD 部署目录，交给 `act_runner` 拥有是合理的。`wolf` 如果还需要访问，可以再通过 ACL 保留权限：

```bash
sudo setfacl -R -m u:wolf:rwx /home/wolf/DIY-docker-compose/ETL-Backend
sudo setfacl -dR -m u:wolf:rwx /home/wolf/DIY-docker-compose/ETL-Backend
```

验证：

```bash
sudo -u act_runner bash -lc 'docker ps >/dev/null && echo docker-ok'
sudo -u act_runner bash -lc 'test -w /home/wolf/DIY-docker-compose/ETL-Backend && echo deploy-dir-ok'
```

最终这两项都通过。

### 下载 runner

初始使用：

```bash
ACT_RUNNER_VERSION=0.2.11
sudo curl -L -o /usr/local/bin/act_runner \
  "https://dl.gitea.com/act_runner/${ACT_RUNNER_VERSION}/act_runner-${ACT_RUNNER_VERSION}-linux-amd64"

sudo chmod +x /usr/local/bin/act_runner
```

后续尝试升级到：

```text
0.2.12
```

但升级没有解决 Actions 页面状态不收尾的问题。

### 生成配置

```bash
sudo -u act_runner /usr/local/bin/act_runner generate-config > /tmp/act_runner_config.yaml
sudo mv /tmp/act_runner_config.yaml /etc/act_runner/config.yaml
sudo chown act_runner:act_runner /etc/act_runner/config.yaml
```

配置中的 label 最终改为 host runner：

```yaml
runner:
  labels:
    - "homelab:host"
```

对应 workflow 中：

```yaml
runs-on: homelab
```

Gitea runner 日志中会显示：

```text
labels updated to: [homelab:host]
runner: homelab-ubuntu, with version: ..., with labels: [homelab], declare successfully
```

### 注册 runner 时遇到的问题

最初尝试用 HTTPS 域名注册：

```bash
--instance https://git.wolfden.website
```

报错：

```text
Cannot ping the Gitea instance server
error="unimplemented: unary response has zero messages"
```

推测原因：

- runner 的 Actions RPC 接口通过 Nginx Proxy Manager 反代时不兼容。
- 普通网页访问没问题，但 runner 注册和通信不是普通网页请求。

> 补充（2026-07-23）：更可能的根因是 fake-ip——本机在 OpenClash 白名单内，DNS 被劫持，`git.wolfden.website` 解析为 198.18.x.x（fake-ip），流量走进代理隧道而非本机 NPM。详见 `修复配置 OpenWrt 旁路由为 DNS 服务器后的网络问题.md` 末尾补充注意。

改用本机端口后注册成功：

```bash
--instance http://127.0.0.1:3001
```

后来又尝试使用局域网真实地址：

```bash
--instance http://192.168.31.119:3001
```

结果：

- 注册可以成功。
- 但 Actions UI 卡住的问题没有变化。

### runner systemd 服务

创建：

```bash
sudo nano /etc/systemd/system/act_runner.service
```

内容：

```ini
[Unit]
Description=Gitea Actions Runner
After=network-online.target docker.service
Wants=network-online.target docker.service

[Service]
User=act_runner
Group=act_runner
SupplementaryGroups=docker
WorkingDirectory=/var/lib/act_runner
ExecStart=/usr/local/bin/act_runner daemon --config /etc/act_runner/config.yaml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now act_runner
sudo systemctl status act_runner --no-pager
```

---

## Gitea 仓库接入

Gitea 中创建仓库：

```text
wolf/ETL-Backend
```

本地 Windows 项目初始化 Git：

```powershell
cd C:\workspace\PythonProject\ETL-Backend

git init
git branch -M main
git add .
git commit -m "Initial commit"
git remote add origin ssh://git@git.wolfden.website:2222/wolf/ETL-Backend.git
git push -u origin main
```

后续确认 remote：

```text
origin  ssh://git@git.wolfden.website:2222/wolf/ETL-Backend.git (fetch)
origin  ssh://git@git.wolfden.website:2222/wolf/ETL-Backend.git (push)
```

---

## workflow 初始设计

workflow 文件：

```text
.gitea/workflows/deploy.yml
```

初始目标流程：

```text
push main
        ↓
Fetch source
        ↓
Check Python syntax
        ↓
Deploy files
        ↓
Verify env
        ↓
docker compose up -d --build
        ↓
Smoke test
```

最初的关键点：

1. 使用 `GITEA_TOKEN` 拉取当前私有仓库。
2. 使用 `python3 -m py_compile` 做轻量语法检查。
3. 使用 `rsync` 同步文件到部署目录。
4. 保留服务器本地 `.env`，不从 Git 覆盖。
5. 通过 Docker 重建并重启服务。

---

## 排障记录一：rsync 权限问题

### 第一次错误

使用：

```bash
rsync -a --delete
```

报错：

```text
rsync: [generator] chgrp "/home/wolf/DIY-docker-compose/ETL-Backend/." failed: Operation not permitted (1)
rsync: [generator] chgrp "/home/wolf/DIY-docker-compose/ETL-Backend/app" failed: Operation not permitted (1)
rsync error: some files/attrs were not transferred (code 23)
```

原因：

`rsync -a` 是归档模式，会尝试保留 owner、group、权限、时间戳等属性。`act_runner` 虽然有写文件权限，但不是目录 owner，因此不能执行 `chgrp`。

### 第二次错误

改成：

```bash
rsync -rlt --delete
```

又报错：

```text
failed to set times on "...": Operation not permitted
```

原因：

`-t` 会保留时间戳。对于不是 owner 的目录，设置时间戳也会失败。

### 最终处理

改成：

```bash
rsync -rl --delete
```

含义：

```text
-r 递归同步
-l 保留软链接
不保留 owner/group/权限/时间戳
```

同步排除项：

```bash
--exclude ".git"
--exclude ".env"
--exclude ".venv"
--exclude "__pycache__"
--exclude ".last-deploy"
```

结论：

部署目录同步只需要内容，不需要保留文件系统属性。对 CI/CD 来说，少碰权限属性反而更稳。

---

## 排障记录二：docker compose 在 runner 中卡住

最初使用：

```bash
docker compose up -d --build --remove-orphans
```

现象：

- Actions 页面卡在 `Rebuild and restart`。
- 日志显示镜像已经 build 完成。
- 日志显示容器已经 Recreated。
- 在 Ubuntu 手动执行：

```bash
docker ps -a --filter name=etl-backend
curl -fsS http://127.0.0.1:8990/docs > /dev/null && echo service-ok
```

结果服务已经正常。

说明：

Docker daemon 已经完成实际重启，但 `docker compose` 子进程没有把结束状态干净交还给 runner，或者 Gitea UI 没有正确完成状态展示。

### 尝试一：拆分 build 和 restart

改为：

```bash
docker compose build --progress plain
docker compose up -d --remove-orphans --no-build
```

结果：

- build 步骤更清楚。
- 但 restart 相关步骤仍然可能卡住。

### 尝试二：compose rm/create/start

改为：

```bash
docker compose rm -sf etl-backend
docker compose create --no-build --force-recreate etl-backend
docker compose start etl-backend
```

结果：

仍然会卡在 compose 生命周期命令附近。

截图中出现过类似：

```text
Container etl-backend Stopping
0.1s
0.2s
0.3s
...
```

推测：

Docker Compose v2 的进度输出和状态机在 act_runner host 模式中表现不稳定。

---

## 排障记录三：Smoke test 卡住

最初 smoke test 使用：

```bash
curl -fsS http://127.0.0.1:8990/docs > /dev/null
```

现象：

- 手动在 Ubuntu 上 curl 可以成功。
- Actions 中 curl 可能出现：

```text
curl: (56) Recv failure: Connection reset by peer
```

或者一直卡住。

### 添加 `/health` 接口

为后端添加：

```python
@app.get("/health")
def health_check():
    return {"status": "ok"}
```

手动验证：

```bash
curl -fsS http://127.0.0.1:8990/health
```

可以成功。

### 添加 Docker HEALTHCHECK

Dockerfile 增加：

```dockerfile
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).read()" || exit 1
```

### 尝试读取 Docker health 状态

使用：

```bash
docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' etl-backend
```

现象：

Actions 中一直看到：

```text
container health: starting
```

但手动 curl `/health` 已经成功。

### 最终处理

由于 smoke test 在 runner 中反复成为卡点，而部署本身已经被验证可以成功，因此删除 smoke test，避免让最后一个检查步骤阻塞主流程。

保留 `/health` 和 Dockerfile `HEALTHCHECK`，用于人工验证或后续外部监控。

---

## 排障记录四：直接 Docker 命令仍然卡住

为了绕开 Docker Compose，尝试改为直接 Docker 命令：

```bash
docker build --progress plain -t etl-backend:latest .
docker rm -f etl-backend
docker run -d \
  --name etl-backend \
  --restart unless-stopped \
  --env-file .env \
  -p 8990:8000 \
  etl-backend:latest
```

现象：

- `docker run -d` 已经输出 container id。
- 实际容器已经启动。
- 但 Gitea Actions 页面仍然卡在当前步骤，不进入下一步。

这一步非常关键，因为它说明问题已经不只是 Docker Compose。

当 Docker CLI 已经输出容器 ID 后，理论上命令应该已经返回。若 Actions 页面仍然不收尾，说明 runner 和 Gitea 服务端之间的 job 状态更新或日志流关闭存在问题。

---

## 排障记录五：runner 显示 Job succeeded，但 Gitea UI 仍显示运行中

有一次 workflow 改为后台触发部署后，Actions 日志中明确出现：

```text
[deploy] triggered; log: /home/wolf/DIY-docker-compose/ETL-Backend/.deploy.log
cleaning up container for job deploy
Job succeeded
```

但 Gitea 页面左侧仍显示：

```text
正在运行
```

这说明：

```text
runner 本地认为 job 已经成功
Gitea Web UI 仍没有把 workflow/job 状态更新为完成
```

此时基本可以排除：

- FastAPI 服务问题
- Dockerfile 问题
- Docker 容器启动问题
- 部署目录权限问题
- workflow 脚本没有退出的问题

更合理的判断是：

```text
Gitea 1.26.2 + act_runner 0.2.11/0.2.12 在当前部署形态下，Actions 状态回写或 UI 状态展示存在兼容性问题。
```

尝试过：

- runner 注册地址 `http://127.0.0.1:3001`
- runner 注册地址 `http://192.168.31.119:3001`
- runner 从 `0.2.11` 升级到 `0.2.12`

结果：

```text
没有解决 UI 一直运行的问题。
```

---

## 当前最终 workflow 形态

为了满足"push 后自动触发部署"的核心目标，同时绕过 runner 等 Docker CLI 输出的问题，当前 workflow 改成后台触发部署。

当前逻辑：

```text
Fetch source
Check Python syntax
Deploy files
Verify env
Trigger deploy
```

最后一步不会等待 Docker 部署完成，而是后台启动部署，并将日志写入：

```text
/home/wolf/DIY-docker-compose/ETL-Backend/.deploy.log
```

当前 workflow 内容如下：

```yaml
name: Deploy ETL Backend

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: homelab
    permissions:
      contents: read
    env:
      GITEA_TOKEN: ${{ secrets.GITEA_TOKEN }}

    steps:
      - name: Fetch source
        run: |
          set -euo pipefail
          SRC="$RUNNER_TEMP/etl-backend-src"
          rm -rf "$SRC"
          git -c http.extraHeader="Authorization: token ${GITEA_TOKEN}" \
            clone --depth 1 --branch main \
            "http://127.0.0.1:3001/${GITHUB_REPOSITORY}.git" "$SRC"

      - name: Check Python syntax
        run: |
          set -euo pipefail
          SRC="$RUNNER_TEMP/etl-backend-src"
          python3 -m py_compile \
            "$SRC/app/main.py" \
            "$SRC/app/models.py" \
            "$SRC/app/schemas.py" \
            "$SRC/app/database.py" \
            "$SRC/collector/collect.py"

      - name: Deploy files
        run: |
          set -euo pipefail
          SRC="$RUNNER_TEMP/etl-backend-src"
          rsync -rl --delete \
            --exclude ".git" \
            --exclude ".env" \
            --exclude ".venv" \
            --exclude "__pycache__" \
            --exclude ".last-deploy" \
            "$SRC/" /home/wolf/DIY-docker-compose/ETL-Backend/

      - name: Verify env
        run: test -f /home/wolf/DIY-docker-compose/ETL-Backend/.env

      - name: Trigger deploy
        run: |
          set -euo pipefail
          DEPLOY_DIR="/home/wolf/DIY-docker-compose/ETL-Backend"
          LOG_FILE="${DEPLOY_DIR}/.deploy.log"
          echo "[deploy] starting background docker deployment"
          nohup bash -lc "
            set -euo pipefail
            cd '${DEPLOY_DIR}'
            {
              echo '[deploy] started at '\"\$(date -Is)\"
              docker build --progress plain -t etl-backend:latest .
              docker rm -f etl-backend >/dev/null 2>&1 || true
              docker run -d \
                --name etl-backend \
                --restart unless-stopped \
                --env-file .env \
                -p 8990:8000 \
                etl-backend:latest
              echo '[deploy] finished at '\"\$(date -Is)\"
            } >> '${LOG_FILE}' 2>&1
          " >/dev/null 2>&1 < /dev/null &
          echo "[deploy] triggered; log: ${LOG_FILE}"
```

---

## 当前项目代码变更

### `app/main.py`

新增健康检查接口：

```python
@app.get("/health")
def health_check():
    return {"status": "ok"}
```

作用：

- 提供轻量服务探活接口。
- 后续可被 Docker HEALTHCHECK、外部监控、手动 curl 使用。

验证：

```bash
curl -fsS http://127.0.0.1:8990/health
```

期望输出：

```json
{"status":"ok"}
```

### `Dockerfile`

新增 Docker 原生健康检查：

```dockerfile
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).read()" || exit 1
```

作用：

- 容器层面可见服务是否健康。
- 即便 Actions 不再等待 health 状态，也可以通过 Docker 自身查看。

查看方式：

```bash
docker ps --filter name=etl-backend
docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' etl-backend
```

### `.gitea/workflows/deploy.yml`

新增 Gitea Actions 自动部署 workflow。

当前采取后台部署方式，避免 runner 卡住。

---

## 当前验证方式

### 查看 Actions 是否触发

Gitea 仓库页面：

```text
wolf/ETL-Backend -> 工作流
```

注意：

Actions 页面可能仍然显示"正在运行"，即使 runner 日志中已经出现 `Job succeeded`。因此当前不能完全依赖 Gitea UI 判断部署是否完成。

### 查看部署日志

在 Ubuntu Server 上：

```bash
tail -f /home/wolf/DIY-docker-compose/ETL-Backend/.deploy.log
```

期望看到：

```text
[deploy] started at ...
...
[deploy] finished at ...
```

### 查看容器状态

```bash
docker ps --filter name=etl-backend
```

期望：

```text
STATUS Up ...
PORTS 0.0.0.0:8990->8000/tcp
```

### 验证服务健康

```bash
curl -fsS http://127.0.0.1:8990/health && echo
```

期望：

```json
{"status":"ok"}
```

### 查看后端 API 文档

```text
http://192.168.31.119:8990/docs
```

或在 Ubuntu 上：

```bash
curl -fsS http://127.0.0.1:8990/docs > /dev/null && echo docs-ok
```

---

## 安全注意事项

### runner token 已经在排障过程中暴露过

排障过程中，runner registration token 曾经被粘贴到对话中。即便这是局域网环境，也建议在 Gitea 管理页面重置或废弃旧 token。

处理建议：

```text
Gitea -> Site Administration -> Actions -> Runners
重新生成或废弃旧 registration token
```

### `act_runner` 属于 docker 组

`act_runner` 被加入 docker 组：

```bash
sudo usermod -aG docker act_runner
```

这意味着 `act_runner` 基本拥有控制 Docker 的高权限。任何能修改 workflow 的人，都可以通过 runner 操作 Docker。

当前风险可接受的原因：

- Gitea 仅局域网使用。
- 仓库是个人控制。
- Gitea 已关闭公开注册：

```yaml
GITEA__service__DISABLE_REGISTRATION=true
```

但后续如果开放给更多用户，需要重新审视权限边界。

### `.env` 不进入 Git

`.env` 保留在服务器部署目录：

```text
/home/wolf/DIY-docker-compose/ETL-Backend/.env
```

workflow 同步时排除：

```bash
--exclude ".env"
```

避免 MySQL 密码进入 Git 仓库。

---

## 当前结论

本次搭建已经完成了这些部分：

- Gitea 在 HomeLab 内网可访问。
- `git.wolfden.website` 通过 NPM 和泛域名证书提供 HTTPS 访问。
- SSH push 通过 `2222` 端口可用。
- `ETL-Backend` 已作为 Gitea 仓库管理。
- `act_runner` 已安装、注册、运行。
- runner 有 Docker 权限和部署目录权限。
- push 后 workflow 能触发。
- workflow 能拉取代码、检查 Python 语法、同步文件。
- 后台部署脚本能触发 Docker build/rm/run。
- `/health` 接口可用于服务探活。
- Dockerfile 已加入 HEALTHCHECK。

但仍存在一个未解决的问题：

```text
Gitea Actions 页面可能一直显示 workflow 正在运行，即使 runner 日志中已经出现 Job succeeded。
```

这不是 ETL-Backend 服务本身的问题，而更像：

```text
Gitea 1.26.2 与 act_runner 0.2.11/0.2.12 在当前 host runner 场景中的状态同步或 UI 展示问题。
```

当前临时策略：

```text
以 Gitea 作为 Git 仓库使用。
Actions 触发后台部署。
部署结果以服务器 .deploy.log、docker ps、/health 为准。
```

---

## 后续可选方向

### 方向一：继续使用当前方案

保留：

```text
Gitea + act_runner + 后台 nohup 部署
```

优点：

- 改动最少。
- push 后能触发部署。
- 不需要再引入新服务。

缺点：

- Actions UI 状态不可靠。
- 需要通过 `.deploy.log` 判断部署结果。

适合：

当前只有个人使用，主要目标是自动部署，不强依赖 Actions 页面状态。

### 方向二：改用 Gitea Webhook

架构：

```text
git push
        ↓
Gitea webhook
        ↓
Ubuntu webhook receiver
        ↓
部署脚本
```

优点：

- 不依赖 act_runner。
- 不会遇到 Actions UI 状态问题。
- 更接近传统自动部署。

缺点：

- 需要部署一个 webhook receiver。
- 需要处理 webhook secret。

适合：

想保留 Gitea，又不想继续折腾 Actions。

### 方向三：回到 bare Git hook

架构：

```text
git push Ubuntu bare repo
        ↓
post-receive hook
        ↓
部署脚本
```

优点：

- 最简单。
- 最少组件。
- 最可靠。

缺点：

- 没有 Gitea Web UI。
- 多仓库管理体验不如 Gitea。

适合：

只关心 `push 后自动部署`，不关心 Web Git 平台功能。

### 方向四：等待或切换 Gitea Runner 新版本

Gitea runner 正在从 `act_runner` 演进到新的 Gitea Runner 体系。后续可尝试：

- 升级 Gitea。
- 升级 runner 到新命名和新版本。
- 查看 Gitea 1.26.x 与 runner 版本兼容性。
- 重新注册 runner。

优点：

- 保留完整 Actions 体验。

缺点：

- 仍然要排查版本兼容问题。

适合：

后续有精力继续完善 HomeLab CI/CD 平台时再做。

---

## 本次经验总结

### 1. Gitea 很适合作为 HomeLab 内网 Git 中心

Gitea 本体部署顺利，局域网 HTTPS 访问也和现有 HomeLab 架构契合。

`git.wolfden.website` 作为统一入口，比直接用 IP + 端口舒服很多。

### 2. runner 权限和部署目录所有权要尽早理清

部署目录如果位于 `/home/wolf/...` 下，而 runner 用户是 `act_runner`，就会很容易遇到文件权限问题。

较稳的原则：

```text
部署目录归 CI/CD 用户所有
人工用户通过 ACL 或 sudo 访问
```

### 3. rsync 不要在 CI/CD 中默认使用 `-a`

`rsync -a` 很顺手，但在跨用户部署目录中容易触发 owner/group/time 权限问题。

本场景更适合：

```bash
rsync -rl --delete
```

### 4. Actions 中直接跑 Docker CLI 可能会遇到奇怪的状态回传问题

本次最耗时的问题不是 Docker 失败，而是 Docker 已经成功执行，但 runner/Gitea UI 没有正常收尾。

这类问题很容易让人误判成：

- 服务没起来。
- curl 不通。
- compose 没执行完。
- workflow 语法问题。

实际从日志看，部署已经发生，只是 UI 状态不可信。

### 5. 对 HomeLab 来说，简单可观察比"正统 CI/CD"更重要

完整 CI/CD 很诱人，但 HomeLab 场景的第一目标是：

```text
push 后自动部署
部署失败能看日志
服务能恢复
不要引入过多维护负担
```

如果 Actions UI 不可靠，可以先退一步，用 webhook、hook、后台脚本等更直接的方式。

---

## 当前操作速查

### 本地开发后推送

```powershell
git add .
git commit -m "your message"
git push
```

### 服务器查看部署日志

```bash
tail -f /home/wolf/DIY-docker-compose/ETL-Backend/.deploy.log
```

### 查看容器

```bash
docker ps --filter name=etl-backend
```

### 查看服务

```bash
curl -fsS http://127.0.0.1:8990/health && echo
```

### 重启 runner

```bash
sudo systemctl restart act_runner
sudo systemctl status act_runner --no-pager
```

### 查看 runner 日志

```bash
sudo journalctl -u act_runner -n 100 --no-pager
```

### 手动部署

```bash
cd /home/wolf/DIY-docker-compose/ETL-Backend

docker build --progress plain -t etl-backend:latest .
docker rm -f etl-backend
docker run -d \
  --name etl-backend \
  --restart unless-stopped \
  --env-file .env \
  -p 8990:8000 \
  etl-backend:latest
```

---

## 最终状态一句话

这次搭建让 `ETL-Backend` 从"本地改完代码后手动复制到 Ubuntu 再手动 Docker 部署"，推进到了"代码进入 Gitea，push 后能触发服务器后台部署"的状态；但 Gitea Actions 页面状态仍存在不可靠问题，后续如果要追求完全干净的 CI/CD 体验，建议优先考虑 Gitea Webhook 或升级到新的 Gitea Runner 体系。
