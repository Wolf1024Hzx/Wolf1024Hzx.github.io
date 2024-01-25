---
title: 指定git使用某个ssh私钥
tags: 其他
categories: 学习
date: 2024-01-25 13:53:08
---


以前使用不当，使得电脑上有多个ssh密钥对在不同的位置，连接github等仓库时不知道使用的哪一个密钥对

在~/.ssh下新建config文件，内容设置为:

```
# Default github user self
Host github.com
	port 22
	HostName ssh.github.com
	IdentityFile ~/.ssh/id_rsa
```

搞定
