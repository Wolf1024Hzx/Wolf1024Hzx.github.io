---
title: Uniapp打包安卓apk流程记录
tags: 其他
categories: 其他
toc:
  showListNumber: false
  maxDepth: 6
  minDepth: 1
date: 2024-09-07 16:51:08
---


# 云打包

访问 [DCloud 官网个人主页](https://ask.dcloud.net.cn/account/setting/profile/) 绑定手机号完成验证

在 HBuilder 中打开项目的 manifest.json ，填写 AppID （没有则点重新获取，同一项目仅获取一次）

点击“发行”->“原生App-云打包”

![云打包截图](/img/Uniapp打包安卓apk流程记录/云打包/屏幕截图%202024-09-05%20112256.png)

等待即可（期间可能会自动下载所需插件，如 scss 和 less 的编译插件等）

打包完成后即可点击链接下载 apk

# 本地打包

## 本地环境

首先装 Java 环境， JDK 版本不建议过低，亲测 21.0.4 的 LTS 可以用

安装 android studio 的旧版本（新版本似乎仅支持 Kotlin ），可以在 [AS 旧版本列表](https://developer.android.google.cn/studio/archive) 中下载旧版本

推荐 4.2.2 ，[下载链接](https://redirector.gvt1.com/edgedl/android/studio/install/4.2.2.0/android-studio-ide-202.7486908-windows.exe)

## uniapp 官方 SDK

[官方 SDK 下载链接](https://nativesupport.dcloud.net.cn/AppDocs/download/android.html)

下载后打开目录，结构如下图所示：

![uniapp sdk 目录结构](/img/Uniapp打包安卓apk流程记录/本地打包/屏幕截图%202024-09-05%20113926.png)

仅需用到 HBuilder-Integrate-AS

使用 android studio 打开 HBuilder-Integrate-AS 项目

![HBuilder-Integrate-AS](/img/Uniapp打包安卓apk流程记录/本地打包/屏幕截图%202024-09-05%20114233.png)

左上角把视图改为 Project

![项目视图](/img/Uniapp打包安卓apk流程记录/本地打包/屏幕截图%202024-09-05%20114347.png)

配置 Project Structure 为项目指定 JDK 和 SDK version

![Project Structure 1](/img/Uniapp打包安卓apk流程记录/本地打包/屏幕截图%202024-09-05%20114702.png)

![Project Structure 2](/img/Uniapp打包安卓apk流程记录/本地打包/屏幕截图%202024-09-05%20114751.png)

![Project Structure 3](/img/Uniapp打包安卓apk流程记录/本地打包/屏幕截图%202024-09-05%20115000.png)

## 开始打包

打开 HBuilder ，将 uniapp 项目生成本地打包资源

![生成本地打包资源](/img/Uniapp打包安卓apk流程记录/本地打包/屏幕截图%202024-09-05%20115304.png)

将生成的 __UNI__APPID 目录移入 HBuilder-Integrate-AS 项目中对应的位置上

![插入 uniapp 打包资源](/img/Uniapp打包安卓apk流程记录/本地打包/屏幕截图%202024-09-05%20115523.png)

替换 dcloud_control.xml 中的 AppId （没改动则不需要替换）

![替换 AppId](/img/Uniapp打包安卓apk流程记录/本地打包/屏幕截图%202024-09-05%20115747.png)

## 获取 AppKey 和签名

在 AS 中生成应用签名

![生成应用签名](/img/Uniapp打包安卓apk流程记录/本地打包/屏幕截图%202024-09-05%20120221.png)

这一步会生成一个 keystore 文件，里面存储我们的签名

记住 keystore 的存储路径（最好设置在项目目录里）、 keystore 的密码、 key 的别名和 key password

在 cmd 中输入 

```BASH
keytool -list -v -keystore [keystore 存储路径]
```

查看签名证书的 SHA1 和 SHA256指纹

会输出类似下列结构的信息：

```BASH
Keystore type: PKCS12    
Keystore provider: SUN    

Your keystore contains 1 entry    

Alias name: test    
Creation date: 2019-10-28    
Entry type: PrivateKeyEntry    
Certificate chain length: 1    
Certificate[1]:    
Owner: CN=Tester, OU=Test, O=Test, L=HD, ST=BJ, C=CN    
Issuer: CN=Tester, OU=Test, O=Test, L=HD, ST=BJ, C=CN    
Serial number: 7dd12840    
Valid from: Fri Jul 26 20:52:56 CST 2019 until: Sun Jul 02 20:52:56 CST 2119    
Certificate fingerprints:    
         MD5:  F9:F6:C8:1F:DB:AB:50:14:7D:6F:2C:4F:CE:E6:0A:A5    
         SHA1: BB:AC:E2:2F:97:3B:18:02:E7:D6:69:A3:7A:28:EF:D2:3F:A3:68:E7    
         SHA256: 24:11:7D:E7:36:12:BC:FE:AF:2A:6A:24:BD:04:4F:2E:33:E5:2D:41:96:5F:50:4D:74:17:7F:4F:E2:55:EB:26    
Signature algorithm name: SHA256withRSA    
Subject Public Key Algorithm: 2048-bit RSA key    
Version: 3
```

**MD5不一定有，据说看 JDK 和 SDK 版本，但不是必须**

登录 [DCloud 开发者后台](https://dev.dcloud.net.cn/pages/app/list) 可以看到我们申请的 AppID 列表

进入我们需要打包的应用，选择“各平台信息”并添加，填入基本信息

![各平台信息](/img/Uniapp打包安卓apk流程记录/本地打包/屏幕截图%202024-09-05%20121303.png)

包名在 HBuilder-Integrate-AS 的 AndroidManifest.xml 中获取

![包名获取](/img/Uniapp打包安卓apk流程记录/本地打包/屏幕截图%202024-09-05%20121514.png)

填写完毕后，即可查看离线打包 key

修改 simpleDemo 中的 build.gradle 填入刚刚获得的签名证书信息

![build.gradle](/img/Uniapp打包安卓apk流程记录/本地打包/屏幕截图%202024-09-05%20121805.png)

最后修改 AndroidManifest.xml 中的 AppKey

![AppKey](/img/Uniapp打包安卓apk流程记录/本地打包/屏幕截图%202024-09-05%20122035.png)

已经可以打包成 apk 了

![生成 apk](/img/Uniapp打包安卓apk流程记录/本地打包/屏幕截图%202024-09-05%20122143.png)

在 AS 弹出来的信息中点击 locate 即可打开 apk 文件所在目录
