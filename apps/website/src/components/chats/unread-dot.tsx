export function UnreadDot({ count }: { count: number }) {
    if (count === 0) {
        return <span aria-hidden="true" className="size-4 shrink-0" />;
    }
    return (
        <span
            aria-label={`${count} unread`}
            className="flex size-4 shrink-0 items-center justify-center"
            role="img"
        >
            <span className="bg-accent size-1.5 rounded-full" />
        </span>
    );
}
