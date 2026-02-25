export type MetricPeriod = "daily" | "weekly" | "monthly"

export type GoalMetric = {
  metric: string
  target: number
  period: MetricPeriod
}

export type ArtifactLike = {
  created_at?: string | null
  request_payload?: any
  response_payload?: any
}

export type GoalDelta = {
  metric: string
  period: MetricPeriod
  target: number
  actual: number
  remaining: number
}

type MetricUpdate = {
  metric: string
  value: number
}

function getWeekStart(date: Date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const day = start.getDay()
  const diff = (day + 6) % 7
  start.setDate(start.getDate() - diff)
  return start
}

function getPeriodBounds(now: Date, period: MetricPeriod) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  if (period === "weekly") {
    const weekStart = getWeekStart(now)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)
    return { start: weekStart, end: weekEnd }
  }

  if (period === "monthly") {
    start.setDate(1)
    const end = new Date(start)
    end.setMonth(end.getMonth() + 1)
    return { start, end }
  }

  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

function isInPeriod(artifactDate: Date, now: Date, period: MetricPeriod) {
  const { start, end } = getPeriodBounds(now, period)
  return artifactDate >= start && artifactDate < end
}

function parseMetricUpdates(artifact: ArtifactLike): MetricUpdate[] {
  const candidates = [
    artifact?.response_payload?.metric_updates,
    artifact?.request_payload?.metric_updates,
    artifact?.response_payload?.metrics,
    artifact?.request_payload?.metrics,
  ]

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue
    const parsed = candidate
      .map((entry: any) => ({
        metric: typeof entry?.metric === "string" ? entry.metric.trim() : "",
        value: Number(entry?.value),
      }))
      .filter((entry: MetricUpdate) => entry.metric.length > 0 && Number.isFinite(entry.value))
    if (parsed.length) return parsed
  }

  return []
}

export function computeGoalDeltas(
  goals: GoalMetric[],
  artifacts: ArtifactLike[],
  now = new Date()
): GoalDelta[] {
  return goals.map((goal) => {
    const actual = artifacts.reduce((sum, artifact) => {
      const created = artifact?.created_at ? new Date(artifact.created_at) : null
      if (!created || Number.isNaN(created.getTime())) return sum
      if (!isInPeriod(created, now, goal.period)) return sum

      const updates = parseMetricUpdates(artifact)
      const metricMatch = updates
        .filter((entry) => entry.metric.toLowerCase() === goal.metric.toLowerCase())
        .reduce((entrySum, entry) => entrySum + entry.value, 0)
      return sum + metricMatch
    }, 0)

    return {
      metric: goal.metric,
      period: goal.period,
      target: goal.target,
      actual,
      remaining: goal.target - actual,
    }
  })
}
