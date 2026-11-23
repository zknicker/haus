export async function postComputerRoute<Response>(path: string, body: object, origin: string) {
    const response = await fetch(new URL(path, origin), {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        redirect: 'error',
    });
    let payload: Response & { code?: string; error?: string };
    try {
        payload = (await response.json()) as Response & { code?: string; error?: string };
    } catch {
        payload = {} as Response & { code?: string; error?: string };
    }
    if (!response.ok) {
        throw new ComputerRequestError(
            payload.error ?? 'Computer request was rejected.',
            payload.code,
            response.status
        );
    }
    return payload;
}

export class ComputerRequestError extends Error {
    constructor(
        message: string,
        readonly code: string | undefined,
        readonly status: number
    ) {
        super(message);
        this.name = 'ComputerRequestError';
    }
}

export function isComputerMachineUnlinked(error: unknown) {
    return (
        error instanceof ComputerRequestError &&
        error.status === 403 &&
        error.code === 'computer_machine_unlinked'
    );
}
