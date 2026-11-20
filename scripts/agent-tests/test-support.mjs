/** The body a Server sends when the tRPC path itself is not routed. */
export function unroutedPathError(path) {
    return trpcError(path, 404, `No "query"-procedure on path "${path}"`);
}

/** The body an authorization or unknown-Agent refusal sends: also NOT_FOUND. */
export function deniedError(path) {
    return trpcError(path, 404, 'No Agent exists on this Server.');
}

function trpcError(path, status, message) {
    const payload = {
        error: { code: -32_004, data: { code: 'NOT_FOUND', httpStatus: status, path }, message },
    };
    return new Error(`${path} failed (${status}): ${JSON.stringify(payload)}`);
}
