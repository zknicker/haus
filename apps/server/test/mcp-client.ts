export async function invokeMcp(
    origin: string,
    token: string,
    body: { args: Record<string, unknown>; toolName: string }
) {
    const response = await fetch(new URL('/api/agent/mcp/invoke', origin), {
        body: JSON.stringify(body),
        headers: {
            'x-haus-mcp-request-id': crypto.randomUUID(),
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        method: 'POST',
    });
    return {
        body: (await response.json()) as { code?: string; message?: string },
        status: response.status,
    };
}
