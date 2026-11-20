export function workerFollowUpControls(input: {
    canStop: boolean;
    draft: string;
    sending: boolean;
    stopHeld: boolean;
}) {
    const stops = input.draft === '' && input.canStop && !input.sending && !input.stopHeld;
    return {
        label: stops ? 'Stop Worker' : 'Send follow-up',
        sendDisabled: input.sending || (input.draft === '' && !stops),
        status: input.sending
            ? ('submitted' as const)
            : stops
              ? ('streaming' as const)
              : ('ready' as const),
        stops,
    };
}
