export const serverAcceptEncoding = 'gzip, deflate, br';

export function applyServerAcceptEncoding(headers: Headers): Headers {
    headers.set('accept-encoding', serverAcceptEncoding);
    return headers;
}

export async function relayDecodedResponse(response: Response): Promise<Response> {
    const body = await response.arrayBuffer();
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    return new Response(body, {
        headers,
        status: response.status,
        statusText: response.statusText,
    });
}
