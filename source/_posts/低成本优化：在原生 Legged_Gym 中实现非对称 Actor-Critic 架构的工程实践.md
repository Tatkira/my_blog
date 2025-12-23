---
title: 低成本优化：在原生 Legged_Gym 中实现非对称 Actor-Critic 架构的工程实践
date: 2025-12-18 18:52:00
tags: [RL, 学习笔记]
categories: 技术日记
---

在进行四足机器人的地形运动控制训练时，我面临着一个非常具体的工程困境。
我的开发环境基于原生的 legged_gym 和早期版本的 rsl_rl (v1.0.2)。这个版本的算法库非常原始，并没有像现在的新版本那样内置成熟的“师生网络（Teacher-Student）”训练框架。
与此同时，我的机器人配置是**“盲走（Blind）”**方案——**不获取线速度和地形高度 (这两个数据在实机中获取的偏移较大，常常不被推荐)**

## 痛点
在早期的尝试中，我遇到了**“信息不对称”**难题：
如果不给策略网络（Actor）输入线速度和地形高度，机器人就像一个瞎子在悬崖边乱跑，Critic  无法给出正确的价值评估，导致模型极易陷入**“自杀式”**的局部最优
如果为了加速收敛，强行把仿真器里的“Ground Truth（真值）”喂给 Actor，训练效果虽然很漂亮，但这个模型在实机上是完全不可用的。因为实机传感器给不出那么完美的数据，输入一有偏差，机器人就立刻倒地。
摆在我面前的有两条路：
> 1. 大改架构：手写一套 Teacher-Student 蒸馏框架，训练一个有特权的老师教导一个只有本体感知的学生。但这对于旧版本的代码库侵入性太强，工程量巨大。
> 2. 巧用数据：保持 PPO 算法不变，通过非对称 Actor-Critic（Asymmetric Actor-Critic） 设计来解题。

我选择了第二条路：最简单、最直接、且最有效。

## 核心设计
非对称设计的核心逻辑在于：Actor（Policy）必须是现实的，而 Critic（Value）可以是全知的。
在 PPO 算法中，Actor 负责输出动作，Critic 负责评估状态价值（Value）。训练结束后，只有 Actor 会被部署到真机上，Critic 随即功成身退。
因此，我重构了观测逻辑，将观测空间强行拆解：
- Actor (Policy)：只能看到**本体感知（Proprioception）**信息。包括关节位置、关节速度以及IMU 角速度。这些数据在真机上非常可靠，噪声较小。
- Critic (Value)：除了 Actor 看到的信息外，还能看到特权观测（Privileged Observations）。包括仿真器提供的绝对线速度真值、脚下的地形采样高度图。

## 代码实现
这是我在 compute_observations 函数中进行的改造。没有修改神经网络，仅仅是在数据流的入口做了区分：
```css
    def compute_observations(self):
        """ Computes observations
        """
        current_obs = torch.cat((  
                                    # self.base_lin_vel * self.obs_scales.lin_vel,
                                    self.base_ang_vel  * self.obs_scales.ang_vel,
                                    self.projected_gravity,
                                    self.commands[:, :3] * self.commands_scale,
                                    (self.dof_pos - self.default_dof_pos) * self.obs_scales.dof_pos,
                                    self.dof_vel * self.obs_scales.dof_vel,
                                    self.actions
                                    ),dim=-1)
        # add perceptive inputs if not blind
        if self.cfg.terrain.measure_heights:
            heights = torch.clip(self.root_states[:, 2].unsqueeze(1) - 0.5 - self.measured_heights, -1, 1.) * self.obs_scales.height_measurements
            current_privileged_obs = torch.cat((current_obs, 
                                                self.base_lin_vel * self.obs_scales.lin_vel, 
                                                heights), dim=- 1)   
        else:
            current_privileged_obs = torch.cat((current_obs, self.base_lin_vel * self.obs_scales.lin_vel), dim=-1)

        # add noise if needed
        if self.add_noise:
            current_privileged_obs += (2 * torch.rand_like(current_privileged_obs) - 1) * self.noise_scale_vec

        self.obs_buf = current_obs  

        self.privileged_obs_buf = current_privileged_obs
```

由于 Critic 拥有上帝视角（获取了地形高度和真实速度），它能精准地预估出当前状态的 Value。当 Actor 在崎岖地形表现不佳时，Critic 能够基于地形信息给出准确的 Advantage 指导，并且由于 Actor 的输入在训练时就被严格限制为“仅本体感知”，部署时我们不需要任何复杂的域适应（Domain Adaptation）或状态估计补偿。
这样不需要去魔改 rsl_rl 库底层的 PPO 实现，也不需要增加额外的蒸馏 Loss，这对于算力有限且依赖旧版本代码库的开发场景来说，是我想到的最优解。
非对称 Actor-Critic 是一种性价比极高的方案。它不仅规避了实机传感器漂移的致命问题，还让我在不升级算法库的前提下，成功训练出了具备复杂地形适应能力的步态策略。