/** A create request the chosen model cannot render exactly; the message names the nearest option. */
export class ImageGenerationRequestError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ImageGenerationRequestError';
    }
}

/** The provider's Owner-supplied key is not stored; no record is created. */
export class ImageGenerationNoKeyError extends Error {
    readonly reason = 'no-key';

    constructor(displayName: string, provider: string) {
        super(
            `${displayName} is unavailable on this Server: no ${provider} API key is configured. ` +
                'The Server Owner adds one in Settings → Image generation.'
        );
        this.name = 'ImageGenerationNoKeyError';
    }
}

/** The idempotency nonce already names a different generation request. */
export class ImageGenerationNonceConflictError extends Error {
    constructor() {
        super('That image generation nonce already belongs to a different request.');
        this.name = 'ImageGenerationNonceConflictError';
    }
}

export class ImageGenerationNotFoundError extends Error {
    constructor(generationId: string) {
        super(`Image generation ${generationId} was not found.`);
        this.name = 'ImageGenerationNotFoundError';
    }
}

/** A reference attachment that is missing, not ready, not an image, or not visible to the Agent. */
export class ImageGenerationReferenceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ImageGenerationReferenceError';
    }
}

export class ImageGenerationSettingsDeniedError extends Error {
    constructor() {
        super('Only the Server Owner can manage image generation keys.');
        this.name = 'ImageGenerationSettingsDeniedError';
    }
}
