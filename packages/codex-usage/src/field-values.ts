export function headerNumber(headers: Headers | undefined, key: string): number | null {
    if (!headers) {
        return null;
    }

    const value = headers.get(key);
    if (value === null) {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export function numberField(
    value: Record<string, unknown> | undefined,
    key: string
): number | null {
    if (!value) {
        return null;
    }

    return coerceNumber(value[key]);
}

export function coerceNumber(value: unknown): number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}
