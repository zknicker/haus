export function SessionLogHiddenCount({ hiddenCount }: { hiddenCount: number }) {
    if (hiddenCount <= 0) {
        return null;
    }

    return (
        <p className="text-muted/60 pb-1 text-center text-sm font-medium">
            {hiddenCount} older {hiddenCount === 1 ? 'entry' : 'entries'}
        </p>
    );
}
