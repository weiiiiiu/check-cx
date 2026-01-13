## 1. 数据库脚本

- [x] 1.1 创建迁移脚本 `supabase/migrations/YYYYMMDDHHMMSS_extend_history_retention.sql`
- [x] 1.2 修改初始化脚本 `supabase/schema.sql`

## 2. 数据库变更内容

- [x] 2.1 添加复合索引 `idx_history_config_checked` 优化时间范围查询
- [x] 2.2 创建可用性统计视图 `availability_stats`
- [x] 2.3 修改 `prune_check_history` 函数：从按数量清理改为按时间清理
- [x] 2.4 新增 `get_check_history_by_time` 函数：支持按时间范围查询

## 3. 后端代码

- [x] 3.1 新增环境变量 `HISTORY_RETENTION_DAYS`，默认值 30
- [x] 3.2 修改 `lib/database/history.ts` 读取环境变量并调整清理逻辑
- [x] 3.3 新增 `lib/types/database.ts` 中的可用性统计类型 `AvailabilityStats`
- [x] 3.4 新增 `lib/database/availability.ts` 查询可用性统计（带缓存）
- [x] 3.5 修改 `lib/core/dashboard-data.ts` 集成可用性数据

## 4. 前端实现

- [x] 4.1 新增可用性统计展示组件 `components/availability-stats.tsx`
- [x] 4.2 新增历史趋势图组件 `components/history-trend-chart.tsx`
- [x] 4.3 在 Dashboard 中集成可用性统计和趋势图
- [x] 4.4 支持切换查看不同时间段的可用性（7天/15天/30天）

## 5. 验证

- [ ] 5.1 本地运行迁移脚本验证无报错
- [ ] 5.2 验证环境变量配置生效
- [ ] 5.3 验证可用性统计计算准确
- [ ] 5.4 验证缓存机制正常工作
- [ ] 5.5 验证历史趋势图展示正常
- [ ] 5.6 验证数据清理策略正常工作
