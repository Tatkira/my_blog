---
title: 基于历史观测堆叠 (History Stacking) 解决盲走的状态模糊
date: 2025-12-18 21:52:00
tags: [RL, 学习笔记]
categories: 技术日记
---

在上一篇博客中，我介绍了如何通过 非对称 Actor-Critic 架构，解决 Sim2Real 中 Actor 无法获取真实线速度和地形高度的痛点。将上帝视角隔离给 Critic，让 Actor 仅依赖本体感知进行决策。


# 单帧观测的局限性

然而，在解决了“能看什么”的问题后，我们还需要解决“看得懂吗”的问题。
对于一个盲式（Blind）机器人，如果仅提供当前时刻（t时刻）的关节位置和 IMU 数据，它面临的是一个典型的 部分可观测马尔可夫决策过程（POMDP）。
单帧的本体感知数据存在状态模糊性（State Ambiguity）：仅凭一张静态的“快照”，机器人很难区分自己是在匀速运动、加速冲刺，还是受到外力干扰。尤其是在没有速度传感器的情况下，Actor 很难推断出自身的运动趋势。

为了解决这个问题，我需要在不修改神经网络模型结构（保持原生 MLP 架构）的前提下，增强 Actor 对时序特征的感知能力。


# 构建观测的历史堆叠

解决方案非常直接：既然网络没有内部记忆单元，那就在输入端把“时间”展开为“空间”。
我引入了 历史观测（History Observation） 机制，将过去 N 步的观测数据进行堆叠（Stacking），作为 Actor 的输入。
经过实验与调试，我选择了 6 步（6 Steps） 作为历史窗口长度。
这背后的逻辑在于：神经网络虽然只是简单的多层感知机，但当它同时看到   t,t−1,…,t−5t,t−1,…,t−5时刻的关节位置时，它能够通过学习权重差异，隐式地进行差分计算：
>  Pos[t]−Pos[t−1]≈Velocity（速度）
>  Vel[t]−Vel[t−1]≈Acceleration（加速度/受力情况）

这样，Actor 就能在没有显式速度输入的情况下，从历史本体感知数据中“推断”出自身的动力学状态。


# 代码实现：维护滑动窗口

在工程实现上，这本质上是维护一个 先进先出（FIFO）的滑动窗口。我需要改造观测缓冲区的更新逻辑。
这里不仅要处理数据的拼接，更重要的是保证数据流在时间轴上的连续性。

### 1.修改缓存
要实现历史观测，第一步必须修改内存分配逻辑。原生的代码中，obs_buf 的大小默认只对应单帧观测的维度。我需要在环境初始化阶段对其进行扩容，使其容量能够容纳设定的历史长度（在我的配置中是 6 步）。
这是修改后的 _init_buffers 函数相关片段：
```css
def _init_buffers(self):
        actor_root_state = self.gym.acquire_actor_root_state_tensor(self.sim)
        dof_state_tensor = self.gym.acquire_dof_state_tensor(self.sim)
        net_contact_forces = self.gym.acquire_net_contact_force_tensor(self.sim)
        rigid_body_state = self.gym.acquire_rigid_body_state_tensor(self.sim) 

        self.gym.refresh_dof_state_tensor(self.sim)
        self.gym.refresh_actor_root_state_tensor(self.sim)
        self.gym.refresh_net_contact_force_tensor(self.sim)
        self.gym.refresh_rigid_body_state_tensor(self.sim)

        self.root_states = gymtorch.wrap_tensor(actor_root_state)
        self.dof_state = gymtorch.wrap_tensor(dof_state_tensor)
        self.dof_pos = self.dof_state.view(self.num_envs, self.num_dof, 2)[..., 0]
        self.dof_vel = self.dof_state.view(self.num_envs, self.num_dof, 2)[..., 1]
        self.base_quat = self.root_states[:, 3:7]
        self.rigid_body_states = gymtorch.wrap_tensor(rigid_body_state).view(self.num_envs, -1, 13)
        self.contact_forces = gymtorch.wrap_tensor(net_contact_forces).view(self.num_envs, -1, 3) 

        self.num_one_step_obs = self.cfg.env.num_one_step_observations
        self.num_obs = self.num_one_step_obs * self.cfg.env.history_len
        self.obs_buf = torch.zeros(self.num_envs, self.num_obs, device=self.device, dtype=torch.float)

        self.num_one_step_privileged_obs = self.cfg.env.num_one_step_privileged_obs
        self.num_privileged_obs = self.num_one_step_privileged_obs * self.cfg.env.history_len
        self.privileged_obs_buf = torch.zeros(self.num_envs, self.num_privileged_obs, device=self.device, dtype=torch.float)

        self.common_step_counter = 0
        self.extras = {}
        self.noise_scale_vec = self._get_noise_scale_vec(self.cfg)
        self.gravity_vec = to_torch(get_axis_params(-1., self.up_axis_idx), device=self.device).repeat((self.num_envs, 1))
        self.forward_vec = to_torch([1., 0., 0.], device=self.device).repeat((self.num_envs, 1))
        self.torques = torch.zeros(self.num_envs, self.num_actions, dtype=torch.float, device=self.device, requires_grad=False)
```
在这里我并没有直接使用 self.num_obs 作为单帧维度，而是将其拆分为 num_one_step_obs（单帧维度）和 num_obs（总输入维度）。
总输入维度计算非常直观：单帧维度 * 历史长度。以此为依据初始化的 self.obs_buf，从一开始就是一个巨大的容器，为后续的滑动窗口操作预留了空间。对于 Critic 的 privileged_obs_buf，我也做了同样的处理，确保价值网络也能利用时序信息进行更准确的价值预估。

### 2.维护滑动窗口
有了容器之后，核心逻辑在于如何在每一步仿真中更新这个容器。我采用的是 **先进先出（FIFO）** 的滑动窗口机制。
```css
def compute_observations(self):
        current_obs = torch.cat((  
                                    self.base_ang_vel  * self.obs_scales.ang_vel,
                                    self.projected_gravity,
                                    self.commands[:, :3] * self.commands_scale,
                                    (self.dof_pos - self.default_dof_pos) * self.obs_scales.dof_pos,
                                    self.dof_vel * self.obs_scales.dof_vel,
                                    self.actions,
                                    ),dim=-1)

        if self.cfg.terrain.measure_heights:
            heights = torch.clip(self.root_states[:, 2].unsqueeze(1) - 0.5 - self.measured_heights, -1, 1.) * self.obs_scales.height_measurements
            current_privileged_obs = torch.cat((current_obs, 
                                                self.base_lin_vel * self.obs_scales.lin_vel, 
                                                heights), dim=- 1)   
        else:
            current_privileged_obs = torch.cat((current_obs, self.base_lin_vel * self.obs_scales.lin_vel), dim=-1)

        if self.add_noise:
            current_privileged_obs += (2 * torch.rand_like(current_privileged_obs) - 1) * self.noise_scale_vec

        actor_obs_len = self.num_one_step_obs
        self.obs_buf = torch.cat((current_privileged_obs[:, :actor_obs_len], 
                                  self.obs_buf[:, :-actor_obs_len]), dim=-1)

        critic_obs_len = self.num_one_step_privileged_obs
        self.privileged_obs_buf = torch.cat((current_privileged_obs,
                                             self.privileged_obs_buf[:, :-critic_obs_len]), dim=-1)
```
首先，构建了当前帧的观测数据。对于 Actor 来说，它的当前帧数据其实就是 current_privileged_obs 的前 actor_obs_len 部分（即剥离了线速度和地形高度后的本体感知数据）。
接着，我使用了 torch.cat 来执行滑动更新：
> 1. 取当前最新的一帧数据放到 Tensor 的最前面（dim=0）。
> 2. 取原 obs_buf 中除了最后一帧之外的所有数据（:-actor_obs_len）。
> 3. 将两者拼接。

这样，obs_buf 始终保持着 [t, t-1, t-2, t-3, t-4, t-5] 的时间结构。网络不仅看到了现在，也看到了过去，从而能感知到关节位置的变化率（速度）和速度的变化率（加速度）。

### 3.重置时的记忆清除
当环境 Reset 时，必须清除历史记忆，否则机器人会带着“上一世”摔倒时的混乱数据开始新的一局，导致开局动作震荡。
```css
def reset_idx(self, env_ids):
        if len(env_ids) == 0:
            return
        
        if self.cfg.terrain.curriculum:
            self._update_terrain_curriculum(env_ids)
        
        if self.cfg.commands.curriculum and (self.common_step_counter % self.max_episode_length==0):
            self.update_command_curriculum(env_ids)
        
        self._reset_dofs(env_ids)
        self._reset_root_states(env_ids)

        self._resample_commands(env_ids)
        self._randomize_dof_props(env_ids, self.cfg)

        self.last_actions[env_ids] = 0.
        self.last_dof_vel[env_ids] = 0.
        self.feet_air_time[env_ids] = 0.
        self.episode_length_buf[env_ids] = 0
        self.reset_buf[env_ids] = 1

        self.obs_buf[env_ids] = 0.
        self.privileged_obs_buf[env_ids] = 0.

        self.extras["episode"] = {}
        for key in self.episode_sums.keys():
            self.extras["episode"]['rew_' + key] = torch.mean(self.episode_sums[key][env_ids]) / self.max_episode_length_s
            self.episode_sums[key][env_ids] = 0.

        if self.cfg.terrain.curriculum:
            self.extras["episode"]["terrain_level"] = torch.mean(self.terrain_levels.float())
        if self.cfg.commands.curriculum:
            self.extras["episode"]["max_command_x"] = self.command_ranges["lin_vel_x"][1]
        if self.cfg.env.send_timeouts:
            self.extras["time_outs"] = self.time_out_buf
```
在原有的重置逻辑中，显式增加 self.obs_buf[env_ids] = 0. 和 self.privileged_obs_buf[env_ids] = 0.。这确保了当特定的环境（env_ids）重置时，其对应的历史观测数据被完全清空，保证下一回合是从“白纸”状态开始的。


通过上面修改实现在没有引入任何复杂网络层（如 LSTM 或 Transformer）的情况下，赋予盲式机器人“短期记忆”。
1. 隐式状态估计（Implicit State Estimation）：
实机没有线速度传感器。但神经网络发现：Position[t] - Position[t-1] 正比于速度，Velocity[t] - Velocity[t-1] 正比于加速度。Actor 通过对比历史 6 步的数据，在网络内部“学会**微分**”，从而在没有速度传感器的情况下，依然能推断出自己当前的运动趋势。
2. 抗噪与平滑（Noise Filtering）：
单帧的传感器数据可能有突发的噪声（Spike）。当输入变为 6 步历史时，网络倾向于学习数据的平均趋势，这天然地起到了低通滤波的作用，使得输出的动作更加平滑，减少了电机的高频抖动。
这种“空间换时间”的工程处理，是在算力受限和实机传感器匮乏的约束下，提升机器人鲁棒性最简单有效的方法。
