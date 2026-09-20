// The visuals lab: one page for judging what the agents actually render.
//
//     bun run visuals:lab      # http://localhost:4390
//
// It is a developer tool and nothing else — not part of `check`, not part of
// CI, not part of any agent workflow. Pressing Run spends real money: each cell
// is a real model turn on this machine's own logins.
//
// Bun.serve plus static files, no build step. This file routes and serializes;
// the queue lives in jobs.mjs and reading finished runs lives in run-reader.mjs.
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeRef } from './before-skill.mjs';
import { visualsBattery } from './engine/prompts.mjs';
// The real frame, straight from the product: the card's srcdoc builder, the
// sandbox capability list, the height clamp, and the resolved theme tokens.
import {
    agentHtmlSandbox,
    buildVisualDocument,
    tokensCssFor,
    visualHeights,
} from './engine/render.mjs';
// The skill's own copy-ready fences, read off the working tree at request time
// so an edit to a module shows up on reload without restarting the server.
import { readSkillFragments, skillDir, skillModules } from './engine/skill-fragments.mjs';
import { enqueue, fragmentCheck, recentJobs, startFragmentCheck } from './jobs.mjs';
import { efforts, modelById, models } from './models.mjs';
import { replyToHtml } from './reply-html.mjs';
import { readResults, resultsDir } from './run-reader.mjs';

const lab = path.dirname(fileURLToPath(import.meta.url));
const variants = ['before', 'after'];
const schemes = ['light', 'dark'];
const port = Number(process.env.PORT ?? 4390);

const readState = async () => ({
    before: beforeLabel(),
    efforts,
    fragmentCheck,
    frame: { heights: visualHeights, sandbox: agentHtmlSandbox },
    jobs: recentJobs(),
    models,
    // The module names the read-chips are drawn from, without the extension,
    // so the page never keeps its own copy of the skill's index.
    modules: skillModules.map(withoutExtension),
    prompts: visualsBattery.map((item) => ({ ask: item.ask, slug: item.slug })),
    results: await readResults(models, variants),
    variants,
});

/** The ref the "before" column stands for, or why the lab cannot read it. */
const beforeLabel = () => {
    try {
        return { error: null, ref: beforeRef() };
    } catch (error) {
        return { error: String(error).slice(0, 200), ref: null };
    }
};

// A fragment belongs to whichever module's index points at it — the gallery
// groups by that rather than by the one directory they all share. Read at call
// time so an edit to a module regroups on reload.
const moduleIndex = () => {
    const index = new Map();
    for (const module of skillModules) {
        const text = readFileSync(path.join(skillDir, module), 'utf8');
        for (const match of text.matchAll(/fragments\/([a-z0-9-]+)\.md/gu)) {
            if (!index.has(match[1])) {
                index.set(match[1], module);
            }
        }
    }
    return index;
};

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
        status,
    });

const html = (body) =>
    new Response(body, {
        headers: { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' },
    });

// Every results path the server hands out goes through here: anything that
// escapes results/ is refused rather than read.
const insideResults = (rel) => {
    if (path.isAbsolute(rel) || rel.split(/[\\/]/u).includes('..')) {
        return null;
    }
    const target = path.join(resultsDir, rel);
    return target.startsWith(`${resultsDir}${path.sep}`) ? target : null;
};

const renderReply = async (request) => {
    const rel = new URL(request.url).searchParams.get('path') ?? '';
    if (!rel.endsWith('.reply.md')) {
        return new Response('path must be a .reply.md under results/', { status: 400 });
    }
    const target = insideResults(rel);
    if (!target) {
        return new Response('path must be relative to results/ and may not traverse', {
            status: 400,
        });
    }
    const markdown = await readFile(target, 'utf8').catch(() => null);
    return markdown === null
        ? new Response(`no reply at results/${rel}`, { status: 404 })
        : html(replyToHtml(markdown));
};

// The srcdoc the chat card would build for this visual, so the page can render
// it live instead of showing a screenshot of it.
const renderVisual = async (request) => {
    const params = new URL(request.url).searchParams;
    const scheme = params.get('scheme') ?? 'dark';
    const rel = params.get('path') ?? '';
    if (!schemes.includes(scheme)) {
        return json({ error: 'unknown scheme' }, 400);
    }
    if (!rel.endsWith('.visual.html')) {
        return json({ error: 'not a visual' }, 400);
    }
    const target = insideResults(rel);
    if (!target) {
        return json({ error: 'outside results' }, 403);
    }
    const source = await readFile(target, 'utf8').catch(() => null);
    return source === null
        ? new Response('not found', { status: 404 })
        : html(buildVisualDocument({ html: source, scheme }));
};

const renderFragment = (request) => {
    const params = new URL(request.url).searchParams;
    const scheme = params.get('scheme') ?? 'dark';
    if (!schemes.includes(scheme)) {
        return json({ error: 'unknown scheme' }, 400);
    }
    const fragment = readSkillFragments().find(
        (candidate) => candidate.slug === params.get('slug')
    );
    return fragment
        ? html(buildVisualDocument({ html: fragment.html, scheme }))
        : json({ error: 'unknown fragment' }, 404);
};

const serveResult = async (pathname) => {
    const target = insideResults(decodeURIComponent(pathname.slice('/results/'.length)));
    if (!target) {
        return new Response('nope', { status: 403 });
    }
    const file = Bun.file(target);
    return (await file.exists())
        ? new Response(file, { headers: { 'cache-control': 'no-store' } })
        : new Response('not found', { status: 404 });
};

/** The effort a run request asked for, defaulting to the model's own. */
const effortFor = (spec, requested) => (efforts.includes(requested) ? requested : spec.reasoning);

Bun.serve({
    idleTimeout: 60,
    port,
    routes: {
        '/': () => new Response(Bun.file(path.join(lab, 'index.html'))),
        '/api/fragment': renderFragment,
        // The skill's own fragments, module by module: the house style as it is
        // actually written, beside what the models produce from it.
        '/api/fragments': () => {
            const owners = moduleIndex();
            return json({
                // The gallery groups by module, in the skill's own reading
                // order rather than alphabetically.
                modules: skillModules,
                fragments: readSkillFragments().map((fragment) => ({
                    kind: fragment.kind,
                    module: owners.get(fragment.slug) ?? 'unreferenced',
                    name: fragment.name,
                    slug: fragment.slug,
                })),
            });
        },
        '/api/fragments/check': {
            POST: () => {
                startFragmentCheck();
                return json({ fragmentCheck });
            },
        },
        // The prose around the visual, as HTML: the whole message gets judged,
        // not just the frame.
        '/api/reply': renderReply,
        '/api/run': {
            POST: async (request) => {
                const body = await request.json();
                const spec = modelById(body.model);
                if (!(spec && variants.includes(body.variant))) {
                    return json({ error: 'unknown model or variant' }, 400);
                }
                return json({
                    job: enqueue(spec.id, body.variant, body.only, effortFor(spec, body.effort)),
                });
            },
        },
        '/api/run-all': {
            POST: async (request) => {
                const body = await request.json().catch(() => ({}));
                const wanted = body.variant === 'both' || !body.variant ? variants : [body.variant];
                if (!wanted.every((variant) => variants.includes(variant))) {
                    return json({ error: 'unknown variant' }, 400);
                }
                const specs = body.models?.length
                    ? body.models.map((id) => modelById(id))
                    : [...models];
                if (!specs.every(Boolean)) {
                    return json({ error: 'unknown model' }, 400);
                }
                return json({
                    jobs: wanted.flatMap((variant) =>
                        specs.map((spec) =>
                            enqueue(
                                spec.id,
                                variant,
                                body.only,
                                effortFor(spec, body.efforts?.[spec.id])
                            )
                        )
                    ),
                });
            },
        },
        '/api/state': async () => json(await readState()),
        // The same token declarations the frame gets, so the page can paint the
        // ground behind the visual with the app's own values.
        '/api/tokens': (request) => {
            const scheme = new URL(request.url).searchParams.get('scheme') ?? 'dark';
            return schemes.includes(scheme)
                ? new Response(tokensCssFor(scheme), {
                      headers: {
                          'cache-control': 'no-store',
                          'content-type': 'text/css; charset=utf-8',
                      },
                  })
                : json({ error: 'unknown scheme' }, 400);
        },
        '/api/visual': renderVisual,
        '/results/*': (request) => serveResult(new URL(request.url).pathname),
    },
});

process.stdout.write(`visuals lab: http://localhost:${port}\n`);
process.stdout.write('runs are real model turns on your own logins and cost money\n');

function withoutExtension(name) {
    return name.replace(/\.md$/u, '');
}
