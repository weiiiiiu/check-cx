## Context

当前系统每个配置仅保留 60 条历史记录，按默认 60 秒轮询间隔计算仅约 1 小时数据。用户希望保留一个月数据并查看长期可用性统计。

**数据量估算**（按 60 秒轮询间隔）：
- 1 小时 = 60 条
- 1 天 = 1,440 条
- 7 天 = 10,080 条
- 15 天 = 21,600 条
- 30 天 = 43,200 条

假设有 20 个配置，一个月总数据量约 864,000 条，数据库存储可接受。

## Goals / Non-Goals

**Goals**:
- 保留可配置天数的历史数据（默认 30 天）
- 支持通过环境变量 `HISTORY_RETENTION_DAYS` 自定义保留时长
- 提供 7 天、15 天、30 天的可用性统计
- 可用性统计使用缓存机制，避免重复查询
- 前端展示历史趋势图
- 保持查询性能，避免全表扫描
- 提供迁移脚本（升级现有数据库）
- 更新初始化脚本（新部署）

**Non-Goals**:
- 不做数据聚合/降采样（保留原始精度）
- 不做实时可用性告警

## Decisions

### 1. 清理策略：基于时间且可配置

**决策**: 将清理逻辑从"保留最新 60 条"改为"保留最近 N 天"，N 通过环境变量配置

**环境变量**:
```
HISTORY_RETENTION_DAYS=30  # 默认值，支持 7-365 天
```

**代码实现** (`lib/database/history.ts`):
```typescript
export const HISTORY_RETENTION_DAYS = Math.min(
  365,
  Math.max(7, parseInt(process.env.HISTORY_RETENTION_DAYS || "30", 10))
);
```

### 2. 可用性统计：数据库视图 + 应用层缓存

**决策**:
- 数据库层：创建 PostgreSQL 视图计算可用性统计
- 应用层：使用基于轮询间隔的缓存，避免重复查询

**缓存策略** (`lib/database/availability.ts`):
```typescript
interface AvailabilityCache {
  data: Map<string, AvailabilityStats[]>;
  lastFetchedAt: number;
}

const cache: AvailabilityCache = {
  data: new Map(),
  lastFetchedAt: 0,
};

// 缓存有效期 = 轮询间隔
const CACHE_TTL_MS = CHECK_POLL_INTERVAL_SECONDS * 1000;

export async function getAvailabilityStats(
  configIds?: string[]
): Promise<Map<string, AvailabilityStats[]>> {
  const now = Date.now();
  if (now - cache.lastFetchedAt < CACHE_TTL_MS && cache.data.size > 0) {
    return filterByIds(cache.data, configIds);
  }

  // 从数据库查询并更新缓存
  const stats = await queryAvailabilityStats();
  cache.data = stats;
  cache.lastFetchedAt = now;
  return filterByIds(stats, configIds);
}
```

### 3. 历史趋势图：基于现有历史数据

**决策**: 复用现有 `check_history` 数据，前端使用图表库（如 recharts）渲染趋势图

**数据结构**:
```typescript
interface TrendDataPoint {
  timestamp: string;      // ISO 时间戳
  latencyMs: number | null;
  status: CheckStatus;
}

interface TrendChartProps {
  configId: string;
  period: '7d' | '15d' | '30d';
  data: TrendDataPoint[];
}
```

**图表展示**:
- X 轴：时间
- Y 轴：延迟（ms）
- 颜色标记：绿色=operational，黄色=degraded，红色=failed

### 4. 索引优化

**决策**: 添加复合索引 `(config_id, checked_at DESC)` 优化查询性能

---

## 脚本设计

### 迁移脚本 `supabase/migrations/YYYYMMDDHHMMSS_extend_history_retention.sql`

```sql
-- =============================================================================
-- 迁移：扩展历史数据留存与可用性统计
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 添加复合索引（优化时间范围查询）
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_history_config_checked
ON public.check_history (config_id, checked_at DESC);

-- -----------------------------------------------------------------------------
-- 2. 创建可用性统计视图
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.availability_stats AS
SELECT
    config_id,
    '7d'::text AS period,
    COUNT(*) AS total_checks,
    COUNT(*) FILTER (WHERE status = 'operational') AS operational_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'operational') / NULLIF(COUNT(*), 0), 2) AS availability_pct
FROM public.check_history
WHERE checked_at > NOW() - INTERVAL '7 days'
GROUP BY config_id

UNION ALL

SELECT
    config_id,
    '15d'::text AS period,
    COUNT(*) AS total_checks,
    COUNT(*) FILTER (WHERE status = 'operational') AS operational_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'operational') / NULLIF(COUNT(*), 0), 2) AS availability_pct
FROM public.check_history
WHERE checked_at > NOW() - INTERVAL '15 days'
GROUP BY config_id

UNION ALL

SELECT
    config_id,
    '30d'::text AS period,
    COUNT(*) AS total_checks,
    COUNT(*) FILTER (WHERE status = 'operational') AS operational_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'operational') / NULLIF(COUNT(*), 0), 2) AS availability_pct
FROM public.check_history
WHERE checked_at > NOW() - INTERVAL '30 days'
GROUP BY config_id;

COMMENT ON VIEW public.availability_stats IS '可用性统计视图，提供 7天/15天/30天 的可用性百分比';

-- -----------------------------------------------------------------------------
-- 3. 修改清理函数：从按数量改为按时间
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_check_history(
    retention_days integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM public.check_history
    WHERE checked_at < NOW() - (retention_days || ' days')::interval;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.prune_check_history IS '清理超过指定天数的历史记录，默认保留 30 天';

-- -----------------------------------------------------------------------------
-- 4. 新增按时间范围查询历史的函数
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_check_history_by_time(
    since_interval interval DEFAULT '1 hour',
    target_config_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
    config_id       uuid,
    status          text,
    latency_ms      integer,
    ping_latency_ms integer,
    checked_at      timestamptz,
    message         text,
    name            text,
    type            text,
    model           text,
    endpoint        text,
    group_name      text
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        h.config_id,
        h.status,
        h.latency_ms,
        h.ping_latency_ms::integer,
        h.checked_at,
        h.message,
        c.name,
        c.type::text,
        c.model,
        c.endpoint,
        c.group_name
    FROM public.check_history h
    JOIN public.check_configs c ON c.id = h.config_id
    WHERE h.checked_at > NOW() - since_interval
      AND (target_config_ids IS NULL OR h.config_id = ANY(target_config_ids))
    ORDER BY c.name ASC, h.checked_at DESC;
$$;

COMMENT ON FUNCTION public.get_check_history_by_time IS '按时间范围查询历史记录';
```

### 初始化脚本修改 `supabase/schema.sql`

需要在现有脚本中添加：

1. **索引部分**添加：
```sql
CREATE INDEX idx_history_config_checked ON public.check_history (config_id, checked_at DESC);
```

2. **视图部分**新增整个 `availability_stats` 视图定义

3. **函数部分**：
   - 修改 `prune_check_history` 函数签名和实现
   - 新增 `get_check_history_by_time` 函数

---

## 前端组件设计

### 可用性统计组件 `components/availability-stats.tsx`

```tsx
interface AvailabilityStatsProps {
  configId: string;
  stats: {
    period: '7d' | '15d' | '30d';
    totalChecks: number;
    operationalCount: number;
    availabilityPct: number | null;
  }[];
  selectedPeriod: '7d' | '15d' | '30d';
  onPeriodChange: (period: '7d' | '15d' | '30d') => void;
}
```

**UI 设计**:
- 显示可用性百分比（大字号）
- 下方显示总检测次数和成功次数
- 提供时间段切换按钮组（7天/15天/30天）
- 根据可用性百分比显示颜色：≥99% 绿色，≥95% 黄色，<95% 红色

### 历史趋势图组件 `components/history-trend-chart.tsx`

```tsx
interface HistoryTrendChartProps {
  configId: string;
  period: '7d' | '15d' | '30d';
  data: {
    timestamp: string;
    latencyMs: number | null;
    status: 'operational' | 'degraded' | 'failed' | 'error';
  }[];
}
```

**图表设计**:
- 使用 recharts 的 AreaChart 或 LineChart
- X 轴：时间（根据 period 自动调整刻度）
- Y 轴：延迟（ms）
- 数据点颜色根据 status 变化
- 支持 hover 显示详细信息

---

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|-----|------|---------|
| 数据量增长导致存储成本上升 | 中 | 默认 30 天，支持通过环境变量调整 |
| 可用性统计查询变慢 | 低 | 使用索引 + 视图 + 应用层缓存 |
| `prune_check_history` 签名变更导致旧代码调用失败 | 中 | 保持参数可选，兼容无参数调用 |
| 趋势图数据量过大导致前端卡顿 | 中 | 后端按时间段聚合/采样，限制返回点数 |

## Migration Plan

**升级现有数据库**:
1. 运行迁移脚本 `supabase/migrations/YYYYMMDDHHMMSS_extend_history_retention.sql`
2. 迁移脚本使用 `CREATE OR REPLACE` 和 `IF NOT EXISTS`，可重复执行

**新部署**:
1. 直接使用更新后的 `supabase/schema.sql`

**回滚**:
```sql
-- 删除视图
DROP VIEW IF EXISTS public.availability_stats;

-- 删除新索引
DROP INDEX IF EXISTS public.idx_history_config_checked;

-- 删除新函数
DROP FUNCTION IF EXISTS public.get_check_history_by_time;

-- 恢复原函数签名（如需要）
CREATE OR REPLACE FUNCTION public.prune_check_history(
    limit_per_config integer DEFAULT 60
)
RETURNS void
LANGUAGE sql
VOLATILE
AS $$
    WITH ranked AS (
        SELECT
            id,
            row_number() OVER (PARTITION BY config_id ORDER BY checked_at DESC) AS rn
        FROM check_history
    )
    DELETE FROM check_history
    WHERE id IN (
        SELECT id FROM ranked WHERE rn > limit_per_config
    );
$$;
```
