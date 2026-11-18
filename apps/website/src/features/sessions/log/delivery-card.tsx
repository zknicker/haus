import type { TranscriptDelivery } from '../../chats/transcript-contract.ts';

export function DeliveryCard({
    currentSessionKey,
    delivery,
}: {
    currentSessionKey: string;
    delivery: TranscriptDelivery;
}) {
    const outgoing = delivery.parentSessionKey === currentSessionKey;
    const targetSessionKey = outgoing ? delivery.childSessionKey : delivery.parentSessionKey;
    const targetLabel = outgoing ? delivery.childSessionName : delivery.parentSessionName;

    return (
        <div
            className={`card-shell flex w-full flex-col gap-1 border px-3 py-2 text-left ${
                outgoing
                    ? 'border-accent-soft bg-accent-soft'
                    : 'border-warning-soft bg-warning-soft'
            }`}
        >
            <span
                className={`text-xs font-medium tracking-[0.16em] uppercase ${
                    outgoing ? 'text-accent' : 'text-warning'
                }`}
            >
                {outgoing ? `Delivered to ${targetLabel}` : `Delivered from ${targetLabel}`}
            </span>
            <span className="text-foreground line-clamp-3 text-sm">
                {delivery.messageText ?? targetLabel}
            </span>
            <span className="text-muted font-mono text-xs">{targetSessionKey}</span>
        </div>
    );
}
