export const telemetryAttributeKeys = [
    'haus.agent.id',
    'haus.chat.id',
    'haus.delivery.kind',
    'haus.failure.kind',
    'haus.message.count',
    'haus.model.id',
    'haus.operation',
    'haus.outcome',
    'haus.output.produced',
    'haus.request.id',
    'haus.retry.count',
    'haus.run.id',
    'haus.runtime.id',
    'haus.server.id',
    'haus.reasoning.effort',
    'haus.turn.harness_ready_ms',
    'haus.turn.bootstrap_ms',
    'haus.turn.session_create_ms',
    'haus.turn.first_stream_ms',
    'haus.turn.first_tool_ms',
    'haus.turn.first_send_ms',
    'haus.turn.last_send_ms',
    'haus.turn.after_last_send_ms',
    'haus.turn.sent_chats',
    'haus.turn.done_chats',
    'haus.tokens.input',
    'haus.tokens.output',
    'haus.tokens.cache_read',
    'haus.tokens.cache_write',
] as const;

export type TelemetryAttributeKey = (typeof telemetryAttributeKeys)[number];
export type TelemetryAttributeValue = boolean | number | string;
export type TelemetryAttributes = Partial<
    Readonly<Record<TelemetryAttributeKey, TelemetryAttributeValue>>
>;

export function sanitizeTelemetryAttributes(
    attributes: Readonly<Record<string, unknown>>
): Record<string, TelemetryAttributeValue> {
    const allowed = new Set<string>(telemetryAttributeKeys);
    return Object.fromEntries(
        Object.entries(attributes).filter(
            (entry): entry is [string, TelemetryAttributeValue] =>
                allowed.has(entry[0]) && ['boolean', 'number', 'string'].includes(typeof entry[1])
        )
    );
}
