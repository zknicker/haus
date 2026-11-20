import type { WorkerReportAttention } from '@haus/api';
import type { AgentInboxItem } from './agent-inbox-item.ts';

export function workerReportAttention(overrides: Partial<WorkerReportAttention> = {}) {
    const report: WorkerReportAttention = {
        citedFiles: [],
        outcome: providerReport('done', 'Fixed the race.'),
        person: null,
        place: 'cursor',
        pullRequests: [],
        taskKey: 'ENG-41',
        title: 'Fix the flaky delivery test',
        turnId: 'wkt_1234567890abcdef',
        turnNumber: 1,
        workerId: 'wkr_1234567890abcdef',
        ...overrides,
    };
    return report;
}

export function providerReport(
    outcome: 'done' | 'needs-you' | 'failed',
    text: string,
    fields: Partial<{
        ask: string;
        personId: string;
        personRefused: string;
        pullRequestUrls: string[];
    }> = {}
) {
    return {
        kind: 'report' as const,
        report: {
            ask: fields.ask ?? (outcome === 'needs-you' ? text : null),
            messageId: 'msg_report1234567890',
            outcome,
            personId: fields.personId ?? null,
            personRefused: fields.personRefused ?? null,
            pullRequestUrls: fields.pullRequestUrls ?? [],
            source: 'provider' as const,
            text,
        },
    };
}

export function workerReportItem(report = workerReportAttention()) {
    return {
        chatId: 'cht_task',
        content: '',
        createdAt: '2026-11-19T12:00:00.000Z',
        id: `worker-report:${report.turnId}`,
        senderHandle: 'haus',
        senderType: 'system',
        sequence: 0,
        target: `task:${report.taskKey}`,
        workerReport: report,
    } satisfies AgentInboxItem;
}
