/**
 * Lightweight metrics tracker.
 *
 * Off by default. When enabled via config, the server tracks counters and
 * exposes them as JSON at the configured path (default `/metrics`).
 */

export interface MetricsSnapshot {
    uptime_seconds: number;
    requests_total: number;
    requests_by_status: Record<string, number>;
    requests_by_method: Record<string, number>;
    in_flight_requests: number;
    errors_total: number;
}

export class Metrics {
    private startedAt = Date.now();
    private byStatus = new Map<number, number>();
    private byMethod = new Map<string, number>();
    private total = 0;
    private errors = 0;

    record(method: string, status: number): void {
        this.total++;
        this.byStatus.set(status, (this.byStatus.get(status) ?? 0) + 1);
        this.byMethod.set(method, (this.byMethod.get(method) ?? 0) + 1);
        if (status >= 500) this.errors++;
    }

    snapshot(inFlight: number): MetricsSnapshot {
        const requestsByStatus: Record<string, number> = {};
        for (const [code, count] of this.byStatus) requestsByStatus[String(code)] = count;
        const requestsByMethod: Record<string, number> = {};
        for (const [m, count] of this.byMethod) requestsByMethod[m] = count;

        return {
            uptime_seconds: Math.floor((Date.now() - this.startedAt) / 1000),
            requests_total: this.total,
            requests_by_status: requestsByStatus,
            requests_by_method: requestsByMethod,
            in_flight_requests: inFlight,
            errors_total: this.errors,
        };
    }
}
