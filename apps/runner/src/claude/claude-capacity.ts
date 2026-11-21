import type { ModelConnectionCapacityWindow } from '@haus/api';
import type { ClaudeRateLimitInfo } from './claude-messages.ts';

export function claudeCapacityWindows(info: ClaudeRateLimitInfo | undefined) {
    const unified = info?.unifiedWindows;
    const windows: ModelConnectionCapacityWindow[] = [];
    for (const [key, id, label] of planWindows) {
        const window = unified?.[key];
        if (window && Number.isFinite(window.utilization) && Number.isFinite(window.resetsAt)) {
            windows.push({
                id,
                label,
                resetsAt: new Date(window.resetsAt * 1000).toISOString(),
                usedPercent: Math.min(100, Math.max(0, Math.round(window.utilization * 1000) / 10)),
            });
        }
    }
    return windows;
}

const planWindows = [
    ['five_hour', 'current-session', '5-hour'],
    ['seven_day', 'current-week-all-models', 'Weekly'],
] as const;
