import { expect, test } from 'bun:test';
import { bodyRefusal } from './trigger-route.ts';

test('refuses a body Fastify could not read and leaves every other fault alone', () => {
    expect(bodyRefusal(Object.assign(new Error('too large'), { statusCode: 413 }))).toEqual({
        code: 'payload_too_large',
        status: 413,
    });
    expect(
        bodyRefusal(Object.assign(new Error('too large'), { code: 'FST_ERR_CTP_BODY_TOO_LARGE' }))
    ).toEqual({ code: 'payload_too_large', status: 413 });
    expect(
        bodyRefusal(
            Object.assign(new Error('bad media type'), { code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE' })
        )
    ).toEqual({ code: 'unsupported_media_type', status: 415 });

    // A Server fault is not a media-type problem: it belongs to Fastify's
    // default handler, which logs it and answers 500.
    expect(bodyRefusal(new Error('the database is on fire'))).toBeNull();
    expect(
        bodyRefusal(Object.assign(new Error('deliberate'), { code: 'FST_ERR_SEND_INSIDE_ONERR' }))
    ).toBeNull();
    expect(bodyRefusal(undefined)).toBeNull();
});
