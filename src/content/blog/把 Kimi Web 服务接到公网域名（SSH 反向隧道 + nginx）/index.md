---
title: 把 Kimi Web 服务接到公网域名（SSH 反向隧道 + nginx）
tags: HomeLab
categories: HomeLab
date: 2026-09-17 15:53
---

## 背景

实验室 GPU 服务器上跑着 kimi web（AI agent 的 Web 前端，监听 `127.0.0.1:58627`）。此前已有校园网内的访问方案（见《用存储节点做 SSH 隧道跳板对校园网暴露 Kimi Web》），现在单纯是折腾，折腾完毕后**出于安全原因已关闭**

手里有一台阿里云 ECS（Ubuntu 24.04，`wolfden.website` 的公网入口，已有 nginx + certbot），于是加一条新链路：用 **SSH 反向隧道**把实验室服务器的端口挂到 ECS 回环，再给个子域名。

目标链路：

```
浏览器 → https://kimi.wolfden.website（DNS → ECS）
       → ECS nginx（TLS 终止）→ 127.0.0.1:9001
       → SSH 反向隧道 → 实验室服务器 127.0.0.1:58627
```

## 实施

### 1. SSH 免密与别名

实验室服务器 `~/.ssh/config` 加：

```
Host aliyun-ecs
    HostName <ECS公网IP>
    Port <端口>
    User <用户名>
```

### 2. 反向隧道

```bash
ssh -N -R 127.0.0.1:9001:127.0.0.1:58627 aliyun-ecs \
  -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3
```

- `-R` 把 ECS 的 `127.0.0.1:9001` 映射回实验室服务器的 `58627`（方向和存储节点那条 `-L` 正向隧道相反）；
- 隧道口绑 ECS 回环即可，nginx 和它在同一台机器，不需要 `GatewayPorts`，安全组也不用开新端口；
- 三个 `-o` 参数沿用存储节点隧道那篇的经验。

验证：ECS 上 `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:9001/`，拿到 200 HTTP 状态码。

### 3. certbot 签证书（HTTP-01）

先加 DNS A 记录 `kimi` → `<ECS公网IP>`，nginx 里先只写 80 端口块并 reload，然后：

```bash
sudo certbot --nginx -d kimi.wolfden.website
```

HTTP-01 的验证过程由 `--nginx` 插件全自动完成（临时应答 `/.well-known/acme-challenge/<token>`），不需要像之前 HomeLab 的 NPM 签泛域名证书那样走 DNS API 加 TXT。HTTP-01 只需要域名 A 记录已指向本机且 80 端口公网可达；它签不了泛域名，但单个子域名用它最简单。续期自动。

### 4. nginx vhost

certbot 生成 443 块后，补 `location /`：

```nginx
location / {
    # SSH 反向隧道 → 实验室服务器 kimi web
    proxy_pass http://127.0.0.1:9001;

    # WebSocket 支持（kimi web 需要）
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # 长连接/流式输出：关掉缓冲、拉长超时
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

### 5. kimi web 侧

启动参数加 `--allowed-host kimi.wolfden.website`（不加会被 DNS-rebinding 检查拦下）。

## 两条隧道链路对比

| | 存储节点正向隧道（旧） | 阿里云反向隧道（本次） |
|---|---|---|
| 方向 | `ssh -L`（跳板机主动连服务器） | `ssh -R`（服务器主动连 ECS） |
| 访问范围 | 仅校园网 | 公网任意网络 |
| 延迟 | 低（同内网） | 多一跳公网回源 |
