---
title: Tracking Sigma 与命令范围
date: 2025-12-06 16:00:00
tags: [RL, isaac gym]
categories: 氵
math: true
---


本篇将讨论线速度追踪奖励中的 $\sigma$（`tracking_sigma`），以及它如何与配置（Cfg）中定义的命令范围（`ranges`）相互耦合。

## 奖励数学形式

在处理移动任务时，我们通常希望机器人的实际线速度 $\mathbf{v}$ 能够精准地匹配用户给出的指令 $\mathbf{v}_{\text{cmd}}$。在二维平面任务中，这一误差的平方可以表示为：

$$
\text{error}^2 = (v_{x,\text{cmd}} - v_x)^2 + (v_{y,\text{cmd}} - v_y)^2
$$

为了将这一物理误差转化为一个落在 $[0, 1]$ 区间的奖励信号，我们通常采用高斯核函数的形式：

$$
r = \exp\left(-\frac{\text{error}^2}{\sigma}\right)
$$

这里的 $\sigma$ 即为 `tracking_sigma`。从函数图像上看，这是一个非常完美的正态分布。

<p style="text-align:center;">
	<img src="/images/tracking_lin_vel.jpg" alt="" style="max-width:60%;height:auto;">
</p>

当误差为0时，奖励取得最大值1；随着误差增大，奖励呈指数级衰减。

## 理解 $\sigma$ 的物理尺度

我们知道正态分布的宽度由方差决定，在奖励函数中，$\sigma$扮演着类似的角色。

我们可以推导一个关键点：当误差 $\text{error}$ 恰好等于 $\sqrt{\sigma}$ 时，奖励值会下降到多少？

$$
r = \exp\left(-\frac{(\sqrt{\sigma})^2}{\sigma}\right) = \exp(-1) \approx 0.368
$$

如果我们将 $\sqrt{\sigma}$ 视为一个阈值：
- 当 $\text{error} < \sqrt{\sigma}$ 时，奖励值依然保持在较高区间，系统认为当前的追踪表现是可以接受的。
- 当 $\text{error} > \sqrt{\sigma}$ 时，奖励值会迅速滑落，系统会向算法发出强烈的惩罚信号。

因此，调整$\sigma$实际是在调整奖励对误差的容忍。$\sigma$越小，曲线越尖锐，对误差要求越高，越难得高分；$\sigma$越大，曲线越平缓，对误差越宽容。

## $\sigma$与命令范围（Ranges）的对齐

在环境配置文件中，我们经常看到线速度指令的范围被设为 `[-1, 1]` m/s。此时，将 `tracking_sigma` 设为 $0.25$ 是一个非常经典的选择（几乎所有四足rl项目都给这个值）。这背后的逻辑在于尺度对齐。

如果我们认为指令的量级（尺度）是$1.0$m/s，那么一个“不可忽视的严重误差”一般被定为该尺度的一半，即 $0.5$ m/s。如果我们希望在误差达到$0.5$ m/s时，奖励信号已经产生明显的衰减（即掉落到 $0.368$ 附近），根据前文的推导，我们需要令：

$$
\sqrt{\sigma} = 0.5 \implies \sigma = 0.25
$$

这就是为什么在命令范围为 `[-1, 1]` 时，$\sigma=0.25$ 往往能取得良好效果的原因。

如果我们将任务难度升级，将命令范围扩大到 `[-2, 2]` m/s。此时，机器人运行的速度更快，考虑到动力学，产生$0.5$m/s的误差可能不再那么要命。如果我们仍希望保持奖励的敏感度与指令尺度成相似比例，则应重新设定：

$$
\sqrt{\sigma} = 1.0 \implies \sigma = 1.0
$$

<p style="text-align:center;">
	<img src="/images/tracking_lin_vel_2.jpg" alt="" style="max-width:60%;height:auto;">
</p>

## 小结

奖励函数的敏感度应当与任务本身的物理尺度相契合。

- 1.  **防止奖励稀疏**：如果 $\sigma$ 设置得过小，机器人即便在学习初期表现出了一定的追踪意图，但由于误差稍大导致奖励直接归零，算法将难以获得有效的梯度信息。
- 2.  **避免目标模糊**：如果 $\sigma$ 设置得过大，机器人即使偏离目标很远依然能获得高额奖励，最终可能会让训练出的策略缺乏精细控制能力。

通过建立 $\sigma \propto (\text{Range})^2$ 的对应关系，我们实际上是在确保算法始终在同一个“相对精度”下进行学习。这种客观中肯的数学权衡，往往比盲目的超参数搜索（Random Search）要高效得多。