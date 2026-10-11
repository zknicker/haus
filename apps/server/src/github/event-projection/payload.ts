// Read-only accessors over an untrusted GitHub webhook body. Every read
// tolerates a missing or mistyped field: GitHub adds and drops fields across
// API versions, and a malformed body must project to less, never throw.

export type Payload = unknown;

export function field(value: Payload, key: string): Payload {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)[key]
        : undefined;
}

export function text(value: Payload, key: string): string | null {
    const read = field(value, key);
    return typeof read === 'string' ? read : null;
}

export function count(value: Payload, key: string): number | null {
    const read = field(value, key);
    return typeof read === 'number' && Number.isFinite(read) ? read : null;
}

export function flag(value: Payload, key: string): boolean | null {
    const read = field(value, key);
    return typeof read === 'boolean' ? read : null;
}

export function list(value: Payload, key: string): unknown[] {
    const read = field(value, key);
    return Array.isArray(read) ? read : [];
}

/** `login` of a nested user object such as `sender` or `pull_request.user`. */
export function login(value: Payload, key: string): string | null {
    return text(field(value, key), 'login');
}

export function labelNames(value: Payload): string[] {
    return list(value, 'labels')
        .map((label) => text(label, 'name'))
        .filter((name): name is string => name !== null);
}

/** Pull request numbers a check or workflow run is attached to. */
export function pullNumbers(value: Payload): number[] {
    return list(value, 'pull_requests')
        .map((pull) => count(pull, 'number'))
        .filter((number): number is number => number !== null);
}
