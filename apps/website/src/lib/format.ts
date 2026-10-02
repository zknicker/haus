const titleCaseSplitPattern = /[\s_-]+/;

export function formatTimestamp(value: string | null | undefined) {
    if (!value || value === 'unknown') {
        return 'unknown';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('en-US', {
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
    }).format(date);
}

export function formatShortTime(value: string | null | undefined) {
    if (!value || value === 'unknown') {
        return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    })
        .format(date)
        .toLowerCase();
}

export function formatRelativeTime(value: string | null | undefined, now = Date.now()) {
    if (!value || value === 'unknown') {
        return 'unknown';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    const diffMs = now - date.getTime();
    const diffMinutes = Math.max(0, Math.round(diffMs / 60_000));

    if (diffMinutes < 2) {
        return 'just now';
    }

    if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
    }

    const diffHours = Math.round(diffMinutes / 60);

    if (diffHours < 24) {
        return `${diffHours}h ago`;
    }

    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d ago`;
}

export function titleCase(value: string) {
	return value
		.split(titleCaseSplitPattern)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join(' ');
}

export function truncate(value: string, maxLength: number) {
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, maxLength - 1)}…`;
}
