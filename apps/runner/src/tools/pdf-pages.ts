import { fileURLToPath } from 'node:url';
import { getDocumentProxy, getResolvedPDFJS, renderPageAsImage } from 'unpdf';

export type PdfPages = ReturnType<typeof openedPages>;

export const maxImagePixels = 2 ** 24;

export interface PageLook {
    readonly kind: 'figure' | 'scanned' | 'text';
    readonly photographic: boolean;
}

const figureImageCoverage = 0.03;
const photographicImageCoverage = 0.5;
const figurePathCount = 16;
const imageLongSidePx = 1568;
const jpegQuality = 0.8;
const standardFontDataUrl = fileURLToPath(
    new URL('standard_fonts/', import.meta.resolve('pdfjs-dist/package.json'))
);

export async function readPdf<T>(
    bytes: Uint8Array,
    signal: AbortSignal,
    view: (pdf: PdfPages) => Promise<T>
) {
    signal.throwIfAborted();
    const { promise: stopped, reject } = Promise.withResolvers<never>();
    stopped.catch(() => undefined);
    const stop = () => reject(signal.reason);
    signal.addEventListener('abort', stop, { once: true });
    try {
        return await viewOpened(bytes, stopped, view);
    } finally {
        signal.removeEventListener('abort', stop);
    }
}

async function viewOpened<T>(
    bytes: Uint8Array,
    stopped: Promise<never>,
    view: (pdf: PdfPages) => Promise<T>
) {
    const opening = getDocumentProxy(bytes, {
        maxImageSize: maxImagePixels,
        standardFontDataUrl,
        useSystemFonts: false,
        verbosity: 0,
    });
    const document = await Promise.race([opening, stopped]).catch((error: unknown) => {
        opening.then(
            (opened) => opened.loadingTask.destroy(),
            () => undefined
        );
        throw error;
    });
    try {
        const viewing = view(openedPages(document));
        viewing.catch(() => undefined);
        return await Promise.race([viewing, stopped]);
    } finally {
        await document.loadingTask.destroy();
    }
}

function openedPages(document: PdfDocument) {
    const texts = new Map<number, Promise<string>>();
    const text = (page: number) => {
        const known = texts.get(page);
        if (known) {
            return known;
        }
        const extracted = withPage(document, page, async (proxy) =>
            (await proxy.getTextContent()).items
                .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
                .join('')
        );
        texts.set(page, extracted);
        return extracted;
    };
    return {
        get extracted() {
            return [...texts.keys()].sort((a, b) => a - b);
        },
        text,
        total: document.numPages,
        async look(page: number) {
            if ((await text(page)).trim().length === 0) {
                return { kind: 'scanned', photographic: true } satisfies PageLook;
            }
            const marks = await pageMarks(document, page);
            return {
                kind:
                    marks.imageCoverage >= figureImageCoverage || marks.paths >= figurePathCount
                        ? 'figure'
                        : 'text',
                photographic: marks.imageCoverage >= photographicImageCoverage,
            } satisfies PageLook;
        },
        render(page: number, look: PageLook) {
            return withPage(document, page, async (proxy) => {
                const viewport = proxy.getViewport({ scale: 1 });
                const format = look.photographic ? 'jpeg' : 'png';
                const bytes = await renderPageAsImage(document, page, {
                    canvasImport: () => import('@napi-rs/canvas'),
                    format,
                    quality: jpegQuality,
                    ...(viewport.width >= viewport.height
                        ? { width: imageLongSidePx }
                        : { height: imageLongSidePx }),
                });
                return {
                    data: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
                        'base64'
                    ),
                    mimeType: `image/${format}`,
                    type: 'image',
                } as const;
            });
        },
    };
}

type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;
type PdfPage = Awaited<ReturnType<PdfDocument['getPage']>>;

async function withPage<T>(
    document: PdfDocument,
    number: number,
    read: (page: PdfPage) => Promise<T>
) {
    const page = await document.getPage(number);
    try {
        return await read(page);
    } finally {
        page.cleanup();
    }
}

function pageMarks(document: PdfDocument, number: number) {
    return withPage(document, number, (page) => marksOf(page));
}

async function marksOf(page: PdfPage) {
    const { OPS } = await getResolvedPDFJS();
    const [x0, y0, x1, y1] = page.view;
    const { argsArray, fnArray } = await page.getOperatorList();
    const painting = new Set<number>([
        OPS.fill,
        OPS.eoFill,
        OPS.stroke,
        OPS.closeStroke,
        OPS.fillStroke,
        OPS.eoFillStroke,
        OPS.closeFillStroke,
        OPS.closeEOFillStroke,
    ]);
    const images = new Set<number>([
        OPS.paintImageXObject,
        OPS.paintInlineImageXObject,
        OPS.paintImageMaskXObject,
    ]);
    const saved: Matrix[] = [];
    let transform: Matrix = [1, 0, 0, 1, 0, 0];
    let imageArea = 0;
    let paths = 0;
    fnArray.forEach((fn, index) => {
        const args = argsArray[index];
        if (fn === OPS.save || fn === OPS.paintFormXObjectBegin) {
            saved.push(transform);
        }
        if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd) {
            transform = saved.pop() ?? transform;
        } else if (fn === OPS.transform) {
            transform = multiply(transform, args);
        } else if (fn === OPS.paintFormXObjectBegin && args?.[0]) {
            transform = multiply(transform, args[0]);
        } else if (images.has(fn)) {
            imageArea += Math.abs(transform[0] * transform[3] - transform[1] * transform[2]);
        } else if (fn === OPS.constructPath && painting.has(args?.[0])) {
            paths += 1;
        }
    });
    return { imageCoverage: Math.min(1, imageArea / ((x1 - x0) * (y1 - y0))), paths };
}

type Matrix = readonly [number, number, number, number, number, number];

function multiply(outer: Matrix, inner: ArrayLike<number>) {
    const [a, b, c, d, e, f] = outer;
    const [a2 = 1, b2 = 0, c2 = 0, d2 = 1, e2 = 0, f2 = 0] = Array.from(inner);
    return [
        a * a2 + c * b2,
        b * a2 + d * b2,
        a * c2 + c * d2,
        b * c2 + d * d2,
        a * e2 + c * f2 + e,
        b * e2 + d * f2 + f,
    ] as const;
}
