import { deflateSync, inflateSync } from 'node:zlib';
import { type AvatarMediaType, avatarMaxBytes, avatarPixelSize } from '@haus/api/avatar';
import { readAvatarBytes } from '../avatars/avatar-bytes.ts';
import { AvatarImageOutputError } from './errors.ts';

const pngSignature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface ProviderAvatarImage {
    bytes: Uint8Array;
    mediaType: AvatarMediaType;
}

export interface NormalizedAvatarImage {
    byteSize: number;
    bytes: Uint8Array;
    height: typeof avatarPixelSize;
    mediaType: 'image/png';
    width: typeof avatarPixelSize;
}

interface DecodedPng {
    height: number;
    pixels: Uint8Array;
    width: number;
}

export function normalizeGeneratedAvatar(input: ProviderAvatarImage): NormalizedAvatarImage {
    if (input.mediaType !== 'image/png') {
        throw new AvatarImageOutputError();
    }

    let decoded: DecodedPng;
    try {
        decoded = decodePng(input.bytes);
    } catch {
        throw new AvatarImageOutputError();
    }

    const bytes = encodePng(resizeCenterCrop(decoded));
    if (bytes.byteLength > avatarMaxBytes) {
        throw new AvatarImageOutputError();
    }

    try {
        readAvatarBytes(Buffer.from(bytes).toString('base64'), 'image/png');
    } catch {
        throw new AvatarImageOutputError();
    }

    return {
        byteSize: bytes.byteLength,
        bytes,
        height: avatarPixelSize,
        mediaType: 'image/png',
        width: avatarPixelSize,
    };
}

function decodePng(bytes: Uint8Array): DecodedPng {
    const input = Buffer.from(bytes);
    if (!startsWith(input, pngSignature)) {
        throw new Error('not png');
    }

    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;
    const imageData: Buffer[] = [];
    let offset = pngSignature.byteLength;

    while (offset < input.byteLength) {
        if (offset + 12 > input.byteLength) {
            throw new Error('truncated chunk');
        }
        const length = input.readUInt32BE(offset);
        const type = input.toString('ascii', offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        const chunkEnd = dataEnd + 4;
        if (chunkEnd > input.byteLength) {
            throw new Error('truncated chunk data');
        }
        const data = input.subarray(dataStart, dataEnd);
        if (type === 'IHDR') {
            if (length !== 13) {
                throw new Error('invalid header');
            }
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8] ?? 0;
            colorType = data[9] ?? 0;
            interlace = data[12] ?? 0;
        } else if (type === 'IDAT') {
            imageData.push(data);
        } else if (type === 'IEND') {
            break;
        }
        offset = chunkEnd;
    }

    const channels = channelsForColorType(colorType);
    if (!(width > 0 && height > 0) || width * height > 16_000_000) {
        throw new Error('invalid dimensions');
    }
    if (bitDepth !== 8 || interlace !== 0 || imageData.length === 0) {
        throw new Error('unsupported png');
    }

    const rowBytes = width * channels;
    const raw = inflateSync(Buffer.concat(imageData));
    const expectedLength = (rowBytes + 1) * height;
    if (raw.byteLength !== expectedLength) {
        throw new Error('invalid scanlines');
    }

    const rgba = Buffer.alloc(width * height * 4);
    let rawOffset = 0;
    let outputOffset = 0;
    let previous: Uint8Array = new Uint8Array(rowBytes);
    for (let row = 0; row < height; row += 1) {
        const filter = raw[rawOffset++];
        const encoded = raw.subarray(rawOffset, rawOffset + rowBytes);
        rawOffset += rowBytes;
        const decoded = unfilter(encoded, previous, filter, channels);
        for (let column = 0; column < width; column += 1) {
            const source = column * channels;
            rgba[outputOffset++] = decoded[source] ?? 0;
            rgba[outputOffset++] =
                channels === 1 || channels === 2
                    ? (decoded[source] ?? 0)
                    : (decoded[source + 1] ?? 0);
            rgba[outputOffset++] =
                channels === 1 || channels === 2
                    ? (decoded[source] ?? 0)
                    : (decoded[source + 2] ?? 0);
            rgba[outputOffset++] =
                channels === 2 || channels === 4 ? (decoded[source + channels - 1] ?? 0) : 255;
        }
        previous = decoded;
    }

    return { height, pixels: rgba, width };
}

function channelsForColorType(colorType: number): number {
    if (colorType === 0) {
        return 1;
    }
    if (colorType === 2) {
        return 3;
    }
    if (colorType === 4) {
        return 2;
    }
    if (colorType === 6) {
        return 4;
    }
    throw new Error('unsupported color type');
}

function unfilter(encoded: Buffer, previous: Uint8Array, filter: number, channels: number): Buffer {
    if (filter > 4) {
        throw new Error('unsupported filter');
    }
    const decoded = Buffer.alloc(encoded.byteLength);
    for (let index = 0; index < encoded.byteLength; index += 1) {
        const left = index >= channels ? (decoded[index - channels] ?? 0) : 0;
        const up = previous[index] ?? 0;
        const upperLeft = index >= channels ? (previous[index - channels] ?? 0) : 0;
        const value = encoded[index] ?? 0;
        const predicted =
            filter === 1
                ? left
                : filter === 2
                  ? up
                  : filter === 3
                    ? Math.floor((left + up) / 2)
                    : filter === 4
                      ? paeth(left, up, upperLeft)
                      : 0;
        decoded[index] = (value + predicted) & 0xff;
    }
    return decoded;
}

function paeth(left: number, up: number, upperLeft: number): number {
    const estimate = left + up - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const upDistance = Math.abs(estimate - up);
    const upperLeftDistance = Math.abs(estimate - upperLeft);
    if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) {
        return left;
    }
    if (upDistance <= upperLeftDistance) {
        return up;
    }
    return upperLeft;
}

function resizeCenterCrop(source: DecodedPng): DecodedPng {
    const cropSize = Math.min(source.width, source.height);
    const cropX = Math.floor((source.width - cropSize) / 2);
    const cropY = Math.floor((source.height - cropSize) / 2);
    const pixels = Buffer.alloc(avatarPixelSize * avatarPixelSize * 4);
    let destination = 0;
    for (let y = 0; y < avatarPixelSize; y += 1) {
        const sourceY =
            cropY + Math.min(cropSize - 1, Math.floor((y * cropSize) / avatarPixelSize));
        for (let x = 0; x < avatarPixelSize; x += 1) {
            const sourceX =
                cropX + Math.min(cropSize - 1, Math.floor((x * cropSize) / avatarPixelSize));
            const sourceOffset = (sourceY * source.width + sourceX) * 4;
            pixels[destination++] = source.pixels[sourceOffset] ?? 0;
            pixels[destination++] = source.pixels[sourceOffset + 1] ?? 0;
            pixels[destination++] = source.pixels[sourceOffset + 2] ?? 0;
            pixels[destination++] = source.pixels[sourceOffset + 3] ?? 255;
        }
    }
    return { height: avatarPixelSize, pixels, width: avatarPixelSize };
}

function encodePng(image: DecodedPng): Uint8Array {
    const rowBytes = image.width * 4;
    const scanlines = Buffer.alloc((rowBytes + 1) * image.height);
    let sourceOffset = 0;
    let targetOffset = 0;
    for (let row = 0; row < image.height; row += 1) {
        scanlines[targetOffset++] = 0;
        Buffer.from(image.pixels).copy(
            scanlines,
            targetOffset,
            sourceOffset,
            sourceOffset + rowBytes
        );
        targetOffset += rowBytes;
        sourceOffset += rowBytes;
    }

    const header = Buffer.alloc(13);
    header.writeUInt32BE(image.width, 0);
    header.writeUInt32BE(image.height, 4);
    header[8] = 8;
    header[9] = 6;
    const chunks = [
        pngChunk('IHDR', header),
        pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0)),
    ];
    return Buffer.concat([Buffer.from(pngSignature), ...chunks]);
}

function pngChunk(type: string, data: Buffer): Buffer {
    const typeBytes = Buffer.from(type, 'ascii');
    const body = Buffer.concat([typeBytes, data]);
    const chunk = Buffer.alloc(12 + data.byteLength);
    chunk.writeUInt32BE(data.byteLength, 0);
    body.copy(chunk, 4);
    chunk.writeUInt32BE(crc32(body), 8 + data.byteLength);
    return chunk;
}

function crc32(bytes: Uint8Array): number {
    let crc = 0xff_ff_ff_ff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xed_b8_83_20 : 0);
        }
    }
    return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
    return prefix.every((byte, index) => bytes[index] === byte);
}
