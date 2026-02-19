export type MetricTags = Record<string, string | number | boolean>;

export interface MetricsCollector {
  increment(name: string, value?: number, tags?: MetricTags): void;
  timing(name: string, durationMs: number, tags?: MetricTags): void;
  snapshot(): {
    counters: Record<string, number>;
    timings: Record<string, number[]>;
  };
}

function keyFor(name: string, tags?: MetricTags): string {
  if (!tags || Object.keys(tags).length === 0) {
    return name;
  }
  const serializedTags = Object.entries(tags)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(",");
  return `${name}|${serializedTags}`;
}

export class InMemoryMetricsCollector implements MetricsCollector {
  private readonly counters = new Map<string, number>();
  private readonly timings = new Map<string, number[]>();

  increment(name: string, value = 1, tags?: MetricTags): void {
    const key = keyFor(name, tags);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  timing(name: string, durationMs: number, tags?: MetricTags): void {
    const key = keyFor(name, tags);
    const existing = this.timings.get(key) ?? [];
    existing.push(durationMs);
    this.timings.set(key, existing);
  }

  snapshot(): {
    counters: Record<string, number>;
    timings: Record<string, number[]>;
  } {
    return {
      counters: Object.fromEntries(this.counters.entries()),
      timings: Object.fromEntries(this.timings.entries()),
    };
  }
}
