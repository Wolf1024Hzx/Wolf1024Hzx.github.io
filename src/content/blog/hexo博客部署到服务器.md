---
title: hexo博客部署到服务器
tags: 其他
categories: 其他
date: 2023-04-27 11:06:04
---


# 参考博客

[第一篇](https://blog.csdn.net/qq_38733240/article/details/108140565?spm=1001.2101.3001.6650.1&utm_medium=distribute.pc_relevant.none-task-blog-2%7Edefault%7ECTRLIST%7ERate-1-108140565-blog-124471586.235%5Ev32%5Epc_relevant_default_base&depth_1-utm_source=distribute.pc_relevant.none-task-blog-2%7Edefault%7ECTRLIST%7ERate-1-108140565-blog-124471586.235%5Ev32%5Epc_relevant_default_base&utm_relevant_index=2)
[第二篇](https://blog.csdn.net/u013190417/article/details/122694959)

但能搜到的基本都使用宝塔面板，实在不想装宝塔，因此自己配置 nginx

# 前期准备

## nodejs 环境

首先搭建 nodejs 环境，使用 nvm 工具安装指定版本

先安装[nvm 工具](https://nvm.uihtm.com/download.html)，版本随意，一路 next 安装即可

安装完毕后，打开 cmd，使用 nvm install 指令安装指定版本的 nodejs

```shell
nvm install 18.15.0
```

然后用 nvm list 查看是否安装成功

```shell
nvm list
```

看到版本号前的星号就表示安装成功，并且当前使用该版本

![nvm list结果](https://wolf-blog-1314051886.cos.ap-guangzhou.myqcloud.com/20230427101039_5dc369d056bbbc7ac8316ae067fe4404.png)

nvm 工具管理 nodejs 版本非常方便，其他指令可自行查询

## 安装 hexo

[hexo 官网](https://hexo.io/zh-cn/)，按照文档做即可创建博客项目，并轻松部署到 Github 上

# 部署到服务器

## 配置 SSH 密钥

能部署到 Github，SSH 密钥应该已经生成了，直接用已经生成过的好了，在 git bash 中查看公钥：

```shell
cat ~/.ssh/id_rsa.pub
```

![cat ~/.ssh/id_rsa.pub](https://wolf-blog-1314051886.cos.ap-guangzhou.myqcloud.com/20230427102305_00b7997bf33985c6a968ba39c4fd645b.png)

把这一串，包括 ssh-rsa 的开头复制出来，待会用

登录到服务器，安装 git

```shell
apt install git
```

然后创建一个 git 用户

```shell
adduser git
```

添加 git 用户权限

```shell
chmod 740 /etc/sudoers
vim /etc/sudoers
```

在 vim 中修改 git 用户权限如下：

![修改git用户权限](https://wolf-blog-1314051886.cos.ap-guangzhou.myqcloud.com/20230427102823_23efa619fdd0fbcc0a104f4f31b0b713.png)

把 sudoers 文件的权限改回来

```shell
chmod 400 /etc/sudoers
```

设置 git 用户的密码

```shell
passwd git
```

切换至 git 用户，然后把我们刚刚复制的公钥放到服务器上
先在 git 用户目录下创建文件夹和指定文件

```shell
su git
cd ~
mkdir .ssh
vim .ssh/authorized_keys
```

在文本编辑器中，把我们的公钥粘贴进去，这个文件可以存放多个公钥：
![用换行分隔](https://wolf-blog-1314051886.cos.ap-guangzhou.myqcloud.com/20230427103554_c9225616c51a533fdaf9f271f3c310c4.png)

保存退出后验证一下是否配置成功，用以下指令，再输入 yes，若不用密码能连接上服务器，说明 ssh 密钥配置成功

```shell
ssh -v git@服务器ip
```

## 创建仓库

用 root 用户创建一个仓库目录用于存放 hexo 部署时上传的代码，其实放哪都行，但所有参考博客都放 var 下，也跟着做了

```shell
mkdir /var/repo
```

给 git 用户赋予访问权限

```shell
chown -R git:git /var/repo
chmod -R 755 /var/repo
```

在这个目录下创建 git 仓库

```shell
cd /var/repo
git init --bare hexo.git
```

创建一个 git 钩子，用于自动部署

```shell
vim /var/repo/hexo.git/hooks/post-receive
```

该文件中写入以下脚本

```bash
#!/bin/bash
git --work-tree=/var/hexo --git-dir=/var/repo/hexo.git checkout -f
```

给这个钩子文件赋予权限

```shell
chown -R git:git /var/repo/hexo.git/hooks/post-receive
chmod +x /var/repo/hexo.git/hooks/post-receive
```

创建 hexo 目录，作为 hexo 打包后存放的目录，也就是 nginx 配置中网站的根目录

```shell
mkdir /var/hexo
chown -R git:git /var/hexo
chmod -R 755 /var/hexo
```

仓库创建配置完成

## 配置 nginx

刚刚提到过，hexo 目录，作为 hexo 打包后存放的目录，也就是 nginx 配置中网站的根目录

在 nginx 配置文件中：

```text
server {
    listen      80;
    server_name FrontEndServer;
    location /xxx {
        alias /var/hexo;
        index index.html;
        try_files $uri $uri/ /xxx/index.html;
    }
}
```

重新加载配置文件

```shell
nginx -s reload
```

## 修改 hexo 配置文件

修改关于部署的部分

```yml
deploy:
  type: git
  repo: git@服务器ip或域名:/var/repo/hexo.git
  branch: master
```

但只改这部分，打包好后的 html 中引用的 css、js 文件都在服务器根目录下，显然这会找不到资源，因此配置\_config.yml 中的网站根路径

```yml
url: http(s)://域名/xxx
root: /xxx/
```

xxx 和 nginx 中配置的访问路径对应

## 安装 hexo 部署插件

有些主题不一定包含 hexo-deployer-git 插件，因此安装一下

```shell
npm i hexo-deployer-git
```

## 一键部署

使用`hexo d -g`，快速将本地博客部署到服务器
done.
