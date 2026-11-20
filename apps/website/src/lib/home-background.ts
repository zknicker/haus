import { z } from 'zod';

export const backgroundPatterns = [
    { id: 'dots', label: 'Dot grid' },
    { id: 'contours', label: 'Contours' },
    { id: 'aurora', label: 'Aurora' },
    { id: 'horizon', label: 'Horizon' },
    { id: 'ghosts', label: 'Ghosts' },
] as const;

export type BackgroundPattern = (typeof backgroundPatterns)[number]['id'];

export type BackgroundSource = 'none' | 'image' | BackgroundPattern;

export const backgroundEffects = [
    { id: 'none', label: 'None' },
    { id: 'dither', label: 'Dither' },
    { id: 'grain', label: 'Grain' },
    { id: 'vignette', label: 'Vignette' },
] as const;

export type BackgroundEffect = (typeof backgroundEffects)[number]['id'];

export const backgroundAdjustments = [
    { defaultValue: 100, id: 'brightness', label: 'Brightness', max: 150, min: 50 },
    { defaultValue: 0, id: 'blur', label: 'Blur', max: 100, min: 0 },
    { defaultValue: 100, id: 'imageOpacity', label: 'Image opacity', max: 100, min: 0 },
    { defaultValue: 0, id: 'bottomFade', label: 'Bottom fade', max: 100, min: 0 },
    { defaultValue: 0, id: 'overlayOpacity', label: 'Overlay opacity', max: 100, min: 0 },
    { defaultValue: 90, id: 'inputOpacity', label: 'Input opacity', max: 100, min: 20 },
] as const;

export type BackgroundAdjustment = (typeof backgroundAdjustments)[number];
export type BackgroundAdjustmentId = BackgroundAdjustment['id'];
export type BackgroundAdjustments = Readonly<Record<BackgroundAdjustmentId, number>>;

export interface BackgroundImageRef {
    readonly id: string;
    readonly name: string;
    readonly type: BackgroundImageType;
}

export const backgroundImageTypes = [
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
] as const;

export type BackgroundImageType = (typeof backgroundImageTypes)[number];

export const backgroundImageMaxBytes = 8 * 1024 * 1024;

export interface ThemeBackground {
    readonly adjustments: BackgroundAdjustments;
    readonly effect: BackgroundEffect;
    readonly image: BackgroundImageRef | null;
    readonly source: BackgroundSource;
}

export type BackgroundArt =
    | { readonly kind: 'image'; readonly image: BackgroundImageRef }
    | { readonly kind: 'none' }
    | { readonly kind: 'pattern'; readonly pattern: BackgroundPattern };

export const defaultBackgroundAdjustments = Object.fromEntries(
    backgroundAdjustments.map((adjustment) => [adjustment.id, adjustment.defaultValue])
) as BackgroundAdjustments;

export function themeBackground(source: BackgroundSource) {
    return {
        adjustments: defaultBackgroundAdjustments,
        effect: 'none',
        image: null,
        source,
    } satisfies ThemeBackground;
}

export const noBackground = themeBackground('none');

export function backgroundArt(background: ThemeBackground) {
    const none = { kind: 'none' } as const satisfies BackgroundArt;
    if (background.source === 'none') {
        return none;
    }
    if (background.source === 'image') {
        return background.image
            ? ({ image: background.image, kind: 'image' } as const satisfies BackgroundArt)
            : none;
    }
    return { kind: 'pattern', pattern: background.source } as const satisfies BackgroundArt;
}

export function clampAdjustment(id: BackgroundAdjustmentId, value: number) {
    const adjustment = backgroundAdjustments.find((entry) => entry.id === id);
    if (!adjustment || !Number.isFinite(value)) {
        return adjustment?.defaultValue ?? 0;
    }
    return Math.round(Math.min(adjustment.max, Math.max(adjustment.min, value)));
}

export function withAdjustment(
    background: ThemeBackground,
    id: BackgroundAdjustmentId,
    value: number
) {
    const adjustments = { ...background.adjustments, [id]: clampAdjustment(id, value) };
    return { ...background, adjustments } satisfies ThemeBackground;
}

export function withDefaultAdjustments(background: ThemeBackground) {
    return {
        ...background,
        adjustments: defaultBackgroundAdjustments,
        effect: 'none',
    } satisfies ThemeBackground;
}

export function parseBackgroundSource(value: unknown) {
    if (value === 'none' || value === 'image') {
        return value;
    }
    return backgroundPatterns.find((pattern) => pattern.id === value)?.id ?? null;
}

export function parseBackgroundEffect(value: unknown) {
    return backgroundEffects.find((effect) => effect.id === value)?.id ?? null;
}

export function imageTypeOf(type: string) {
    return backgroundImageTypes.find((entry) => entry === type) ?? null;
}

const adjustmentsSchema = z
    .object(
        Object.fromEntries(
            backgroundAdjustments.map((adjustment) => [
                adjustment.id,
                z
                    .number()
                    .catch(adjustment.defaultValue)
                    .transform((value) => clampAdjustment(adjustment.id, value)),
            ])
        )
    )
    .catch(defaultBackgroundAdjustments);

const imageSchema = z
    .object({
        id: z.string().regex(/^[a-z0-9]{1,32}$/u),
        name: z.string().max(200),
        type: z.string().transform((value, context) => {
            const type = imageTypeOf(value);
            if (!type) {
                context.addIssue({ code: 'custom', message: 'not a background image type' });
                return z.NEVER;
            }
            return type;
        }),
    })
    .nullable()
    .catch(null);

const backgroundSourceIds = [
    'none',
    'image',
    ...backgroundPatterns.map((pattern) => pattern.id),
] as const satisfies readonly BackgroundSource[];

export const themeBackgroundSchema = z
    .object({
        adjustments: adjustmentsSchema,
        effect: z.enum(backgroundEffects.map((effect) => effect.id)).catch('none'),
        image: imageSchema,
        source: z.enum(backgroundSourceIds).catch('none'),
    })
    .transform((background) =>
        background.source === 'image' && !background.image
            ? { ...background, source: 'none' as const }
            : background
    );

export function parseThemeBackground(value: unknown) {
    const parsed = themeBackgroundSchema.safeParse(value);
    return parsed.success ? (parsed.data as ThemeBackground) : null;
}

export function newBackgroundImageId(random = Math.random) {
    return Math.floor(random() * 36 ** 10)
        .toString(36)
        .padStart(10, '0');
}

export function backgroundImageProblem(file: { size: number; type: string }) {
    if (!imageTypeOf(file.type)) {
        return 'Choose a PNG, JPEG, GIF, WebP or AVIF image.';
    }
    if (file.size > backgroundImageMaxBytes) {
        const megabytes = (file.size / (1024 * 1024)).toFixed(1);
        return `That image is ${megabytes} MB. Choose one up to 8 MB.`;
    }
    return null;
}
