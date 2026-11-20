const postgresFields = ['errno', 'code', 'constraint', 'table', 'detail', 'hint', 'where'] as const;

export function describeMigrationFailure(error: unknown, databaseUrl: string) {
    const lines: string[] = [];
    let current: unknown = error;
    while (current !== undefined && lines.length < 8) {
        lines.push(lines.length === 0 ? describe(current) : `Caused by: ${describe(current)}`);
        current = current instanceof Error ? current.cause : undefined;
    }
    return redact(lines.join('\n'), databaseUrl);
}

function describe(error: unknown) {
    if (!(error instanceof Error)) {
        return String(error);
    }
    const fields = postgresFields.flatMap((field) => {
        const value = (error as unknown as Record<string, unknown>)[field];
        return typeof value === 'string' && value ? [`${field}: ${value}`] : [];
    });
    return [error.message || error.name, ...fields].join('\n    ');
}

function redact(text: string, databaseUrl: string) {
    const secrets = [databaseUrl];
    if (URL.canParse(databaseUrl)) {
        const { password } = new URL(databaseUrl);
        if (password) {
            secrets.push(password, decodeURIComponent(password));
        }
    }
    return secrets.reduce((redacted, secret) => redacted.replaceAll(secret, '[redacted]'), text);
}
