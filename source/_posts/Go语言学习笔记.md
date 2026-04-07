---
title: Go语言学习笔记（持续更新中）
tags: 后端
categories: 后端
date: 2026-04-03 11:23
---

# Go语言学习笔记

本文记录了我在学习 Go 语言过程中对若干核心概念的补充理解，包括并发机制、协程调度和垃圾回收原理。

## 基础

参考 [Golang 中文学习文档](https://golang.xiniushu.com/)

### 并发

#### 超时机制

下面的代码通过**select + channel**实现超时解放主协程

```golang
func work(workSecond int, doneChan chan struct{}) {
	time.Sleep(time.Duration(workSecond) * time.Second)
	doneChan <- struct{}{}
}

func workController(workSecond int) {
    // 必须给容量1，防止子协程堵塞
	doneChan := make(chan struct{}, 1)

	go work(workSecond, doneChan)
	select {
	case <-doneChan:
		fmt.Println("任务完成")
		return
	case <-time.After(5 * time.Second):
		fmt.Println("任务超时")
		return
	}
}
```

下面则是通过**contex**实现超时解放主协程

```golang
func work(workSecond int, doneChan chan struct{}) {
	time.Sleep(time.Duration(workSecond) * time.Second)
	doneChan <- struct{}{}
}

func workControllerWithContext(workSecond int) {
	doneChan := make(chan struct{}, 1)

	ctx, cancel := context.WithTimeout(context.Background(), 5 * time.Second)
	defer cancel()

	go work(workSecond, doneChan)
	select {
	case <-doneChan:
		fmt.Println("任务完成")
		return
	case <-ctx.Done():
		fmt.Println("任务被取消")
		return
	}
}
```

本质上用Context也一样，只能超时解放主协程，但终究做不到主动kill子协程(work还是在跑)

但Context的意义在于:

1. 可以批量解放对子协程的等待。如果只用select + channel，每个子协程都要新建一个channel，维护是地狱难度
2. 终止的原因不一定是超时，context可以手动cancel
3. 数据库读取、网络请求等库，是封装好的，是可以用context做到取消子协程任务的（这些库也做不到kill子协程，而是靠监听到Contex的中止信号后，调用更底层的操作系统接口"拔网线"，让子协程出错自然终止任务）

## 进阶

参考 [《Golang 修养之路》](https://github.com/aceld/golang/tree/main)

### 协程调度

Go 的协程调度分为旧版的 GM 模型（已废弃）和当前的 GMP 模型

#### GM 模型

原文中没有讲清楚

G 都在一个队列中，这个队列有把互斥锁

M 有两种操作，一是取出 G，二是放回 G。两种操作都是进行前给队列上锁（上锁失败就堵塞），操作后马上解锁。执行 G 的代码是在取出并解锁后执行的，否则肯定会堵塞其他 M

GM 模型主要有以下两个缺点：
1. **互斥锁竞争激烈** 协程的取出、放回都是非常频繁的，这就导致各个 M 之间对 G 队列互斥锁的访问频率都非常频繁，竞争互斥锁导致大量 cpu 性能损耗
2. 同一个 G 可能会被多个 M 执行，这就导致 cache 命中率低。（这里拓展一下，现在的多核 cpu，一般 L1 和 L2 cache 是核心独占的，L3 才是所有核心共享的。两个线程在两个不同的核心上运行很正常。同一个 G 被不同的 M 执行就会导致 L1 和 L2 cache 失效）

**PS：** 上面第二点里提到的 L1 和 L2 cache 核心独占，倒也不是没有例外。比如 Intel 臭名昭著的大小核，小核是共享 L2 的（可恶啊我的 i5-13600KF）。AMD 的 X3D 系列将 L3 拆成多个 CCD（理解成多个块就行），不同 CCD 之间的通信延迟比较高

#### GMP 模型

首先要注意 P 不是进程（Progress）而是处理器(Processor)，模型图如下：

![GMP 模型](/img/Go学习笔记/GMP.png)

全局队列其实就是 GM 模型里的 G 队列

当某个 M 空闲，可以执行任务时，就先找到自己对应的 P，然后找到这个 P 对应的 G 本地队列，从里面取 G 出来执行。如果本地队列为空，那就去全局队列里取一批放到自己的本地队列（注意互斥锁）。如果全局队列也是空的，那就**从其他 P 本地队列偷一半 G 来自己本地队列里**

**注意！！！如果 G 在运行时生成了 $G_1$  那么 $G_1$ 会直接放在当前 P 的本地队列**（本地队列存满才放进全局队列）

P 和 M 的映射不是静态的！！！可以转移，见原文

注意 M 执行 G 触发阻塞（比如等待 io 或 channel）时的机制！！！（创建一个新线程继续执行，当前这个 M 去找其他 P 来拿 G 执行）

### 垃圾回收

三色标记：
1. **黑色** 表示已经彻底安全，从根节点出发可达，不会被删掉
2. **灰色** 从黑色节点延伸出来距离为 1 的节点，待扫描。灰色节点的邻居节点都被扫描后，变黑
3. **白色** 还未被扫描到的节点。如果扫描流程结束后还是白色，说明不可达，要被清除

为了不出现原文中节点被误删的情况，引入写屏障。即三色标记的过程中，黑色节点不能直接引用一个"悬挂的"白色节点，必须白色节点有上级可以追溯到灰色节点，否则这个白色节点直接变灰

**注意：写屏障只作用在堆空间，这是因为栈空间用于存有作用域的变量，频繁的 pop、push 如果引入写屏障会影响性能**

扫描完一次堆空间后，再开启 STW（暂停所有工作） 三色标记栈空间，清除栈空间里没引用的对象

删屏障：如果灰节点要删除对一个白节点的引用（白节点下面挂着其他白节点）并且这个白节点没有其他上级灰节点，那么这个白节点要变灰

混合写屏障：为了改善写屏障需要对栈多扫描一次（并且这多扫一次还需要 STW）的问题。GC 开始时，栈所有的对象全变黑，扫描过程中，栈新加入的对象直接染灰

### Channel

记住"读写**空**阻塞，写**关闭**异常，读**关闭空**零假"

本节的原文是 [Go 语言设计与实现 6.4 Channel](https://draveness.me/golang/docs/part3-runtime/ch06-concurrency/golang-channel/)

hchan 结构体里有一个环形缓冲区（`buf`）、发送等待队列（`sendq`）、接收等待队列（`recvq`）和一把互斥锁（`lock`）。理解了这四个字段，发送和接收的流程就是自然推导出来的：发送时缓冲区没满就写 buf，满了就把当前 goroutine 挂到 sendq 里阻塞；接收时 buf 有数据就读，没数据就挂到 recvq 里阻塞。有人来读/写的时候顺便唤醒对面队列里等着的 goroutine