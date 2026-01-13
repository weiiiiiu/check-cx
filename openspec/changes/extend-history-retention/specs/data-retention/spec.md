## ADDED Requirements

### Requirement: 历史数据保留策略

系统 SHALL 保留每个配置最近 N 天的检测历史记录，N 通过环境变量 `HISTORY_RETENTION_DAYS` 配置。

系统 SHALL 使用默认值 30 天，当环境变量未设置或无效时。

系统 SHALL 限制保留天数范围为 7-365 天。

系统 SHALL 在每次写入新记录后，删除超过 N 天的历史数据。

#### Scenario: 使用默认保留天数

- **GIVEN** 环境变量 `HISTORY_RETENTION_DAYS` 未设置
- **WHEN** 系统执行清理操作
- **THEN** 系统删除超过 30 天的历史记录

#### Scenario: 使用自定义保留天数

- **GIVEN** 环境变量 `HISTORY_RETENTION_DAYS=60`
- **WHEN** 系统执行清理操作
- **THEN** 系统删除超过 60 天的历史记录

#### Scenario: 保留天数超出范围时使用边界值

- **GIVEN** 环境变量 `HISTORY_RETENTION_DAYS=500`
- **WHEN** 系统解析配置
- **THEN** 系统使用 365 天作为保留天数

---

### Requirement: 可用性统计计算

系统 SHALL 提供按时间段计算的可用性百分比统计。

可用性百分比的计算公式为：`(operational 状态的记录数 / 总记录数) × 100`

系统 SHALL 支持以下时间段：
- 7 天
- 15 天（半月）
- 30 天（一个月）

#### Scenario: 查询 7 天可用性统计

- **GIVEN** 某配置在过去 7 天内有 10,000 条检测记录
- **AND** 其中 9,500 条状态为 `operational`
- **WHEN** 查询该配置的 7 天可用性统计
- **THEN** 返回可用性百分比为 95.00%
- **AND** 返回总检测次数为 10,000
- **AND** 返回成功次数为 9,500

#### Scenario: 无历史数据时的统计

- **GIVEN** 某配置在指定时间段内无检测记录
- **WHEN** 查询该配置的可用性统计
- **THEN** 返回可用性百分比为 null
- **AND** 返回总检测次数为 0

---

### Requirement: 可用性统计缓存

系统 SHALL 缓存可用性统计查询结果。

缓存有效期 SHALL 等于轮询间隔时间（`CHECK_POLL_INTERVAL_SECONDS`）。

系统 SHALL 在缓存过期后自动刷新数据。

#### Scenario: 缓存命中

- **GIVEN** 可用性统计已被查询且缓存未过期
- **WHEN** 再次查询可用性统计
- **THEN** 系统返回缓存数据
- **AND** 不执行数据库查询

#### Scenario: 缓存过期后刷新

- **GIVEN** 可用性统计缓存已过期
- **WHEN** 查询可用性统计
- **THEN** 系统执行数据库查询
- **AND** 更新缓存数据
- **AND** 返回最新数据

---

### Requirement: 可用性统计展示

Dashboard SHALL 展示每个配置的可用性统计。

用户 SHALL 能够切换查看不同时间段（7 天、15 天、30 天）的可用性。

可用性百分比 SHALL 根据数值显示不同颜色：
- ≥99%：绿色
- ≥95% 且 <99%：黄色
- <95%：红色

#### Scenario: Dashboard 展示可用性

- **WHEN** 用户访问 Dashboard
- **THEN** 每个配置卡片显示默认时间段（7 天）的可用性百分比
- **AND** 显示格式为 "可用性: XX.XX%"

#### Scenario: 切换时间段

- **GIVEN** 用户正在查看 Dashboard
- **WHEN** 用户选择 "30 天" 时间段
- **THEN** 所有配置的可用性统计更新为 30 天的数据

---

### Requirement: 历史趋势图展示

Dashboard SHALL 提供历史趋势图组件，展示配置的延迟变化趋势。

趋势图 SHALL 支持 7 天、15 天、30 天的时间范围。

趋势图 SHALL 使用以下视觉编码：
- X 轴：时间
- Y 轴：延迟（毫秒）
- 数据点颜色：绿色=operational，黄色=degraded，红色=failed/error

#### Scenario: 查看 7 天趋势图

- **GIVEN** 用户点击某配置的趋势图入口
- **WHEN** 选择 "7 天" 时间范围
- **THEN** 显示该配置最近 7 天的延迟趋势图
- **AND** 图表支持 hover 显示详细信息（时间、延迟、状态）

#### Scenario: 趋势图数据点过多时采样

- **GIVEN** 某时间范围内数据点超过 500 个
- **WHEN** 渲染趋势图
- **THEN** 系统对数据进行采样以保证渲染性能
- **AND** 保留关键数据点（状态变化点、最大/最小延迟点）
