# Change: 扩展历史数据留存与可用性统计

## Why

当前系统每个配置仅保留 60 条历史记录（约 1 小时数据），无法支撑长期可用性分析。用户需要查看 7 天、半月、一个月的可用性统计，以评估服务稳定性趋势。

## What Changes

- **BREAKING**: 修改历史数据保留策略，从 60 条扩展到可配置天数（默认 30 天）
- **BREAKING**: `prune_check_history` 函数签名变更：从 `limit_per_config` 改为 `retention_days`
- 新增环境变量 `HISTORY_RETENTION_DAYS` 支持自定义保留时长
- 新增数据库视图 `availability_stats`，计算 7天/15天/30天 的可用性百分比
- 新增数据库函数 `get_check_history_by_time`，支持按时间范围查询
- 新增复合索引优化时间范围查询性能
- 新增可用性统计缓存机制（基于轮询间隔）
- 前端新增可用性统计展示组件
- 前端新增历史趋势图组件

## Impact

- Affected specs: `data-retention` (新建)
- Affected code:
  - `lib/database/history.ts` - 修改清理逻辑，读取环境变量
  - `lib/types/database.ts` - 新增视图类型
  - `lib/database/availability.ts` - 新增可用性统计查询（带缓存）
  - `lib/core/dashboard-data.ts` - 集成可用性数据
  - `components/availability-stats.tsx` - 新增可用性统计展示组件
  - `components/history-trend-chart.tsx` - 新增历史趋势图组件
- Affected database:
  - `supabase/schema.sql` - 初始化脚本更新
  - `supabase/migrations/` - 新增迁移脚本
