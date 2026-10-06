/** Codex turns from the 2026-10-06 Activity review (see `turn-trace-test-fixtures.ts`). */
import { call, journal, think } from './turn-trace-test-fixtures.ts';

const ws = { cwd: '<workspace>' };

/** Blippy / codex: a failed `ls`, five parallel sleeps, a run of curl "searches". */
export const codexFailureTurn = journal(
    'run_QQb81oCNI9CKv2pT',
    ['44:07.967', '46:08.228'],
    [
        call('claim', 'bash', ['44:18.293', '44:19.014'], {
            command: "haus task claim --target 'dm:@zach-knickerbocker' --message-id 'EXE8hoyT'",
            ...ws,
        }),
        call('memory', 'read', ['44:21.478', '44:21.478'], { path: 'MEMORY.md' }),
        call(
            'ls',
            'bash',
            ['44:23.709', '44:23.709'],
            {},
            {
                error: {
                    exit_code: 1,
                    formatted_output: 'ls: /definitely/not/here: No such file or directory\n',
                },
                status: 'failed',
            }
        ),
        ...['44:27.274', '44:27.275', '44:27.276', '44:27.277', '44:27.277'].map((start, index) =>
            call(`sleep-${index}`, 'bash', [start, '45:12.139'], {
                command: 'sleep 45 && echo done',
                ...ws,
            })
        ),
        call('execute', 'execute', ['45:16.451', '45:17.045'], {
            code: 'return await tools.search({query:"web search internet search"});',
        }),
        call('browser', 'browser', ['45:19.565', '45:19.565'], {
            args: [
                'tab',
                'new',
                'https://www.google.com/search?q=base62+url+shortener+collision+rate',
            ],
        }),
        call('curl-1', 'bash', ['45:24.021', '45:24.023'], {
            command: "curl -L --max-time 30 'https://html.duckduckgo.com/html/?q=base62'",
            ...ws,
        }),
        call('curl-2', 'bash', ['45:26.739', '45:26.829'], {
            command: "curl -L --max-time 30 'https://www.google.com/search?q=base62'",
            ...ws,
        }),
        call('send', 'bash', ['45:59.818', '46:00.176'], {
            command:
                "haus message send --target 'dm:@zach-knickerbocker' --reply-to 'EXE8hoyT' --done <<'HAUSMSG'\nCompleted.\nHAUSMSG",
            ...ws,
        }),
        call('done', 'bash', ['46:02.345', '46:02.671'], {
            command: "haus task update --target 'dm:@zach-knickerbocker' --number 2 --status done",
            ...ws,
        }),
        call('memory-write', 'fileChange', ['46:06.510', '46:06.510'], {
            event: 'modify',
            path: 'MEMORY.md',
        }),
    ],
    {
        reasoning: [
            think('r1', '44:26.165', '44:26.200', '\n\n**Running five parallel exec commands**'),
            think('r2', '45:22.882', '45:23.000', '\n\n**Planning web search using curl**'),
            think('r3', '45:26.024', '45:26.100', '\n\n**Testing Bing search access**'),
        ],
    }
);

/** Blippy / codex: image_gen plus upload and reply, among nine reasoning titles. */
export const imageTurn = journal(
    'run_sAxbnKLjlx68PCI5',
    ['39:23.824', '40:49.438'],
    [
        call('ack', 'bash', ['39:37.401', '39:37.858'], {
            command:
                "haus message send --target 'dm:@zach-knickerbocker' <<'HAUSMSG'\nOn it.\nHAUSMSG",
            ...ws,
        }),
        call('help', 'bash', ['39:41.280', '39:41.587'], {
            command: 'haus task claim --help',
            ...ws,
        }),
        call('skill', 'read', ['39:49.374', '39:49.374'], {
            path: '/Users/zknicker/.haus/dev/cnreview/computer/servers/srv_WaQNQzGWyLYyqZDE/agents/agt_swCs1-vWzDgtd41k/home/.codex/skills/.system/imagegen/SKILL.md',
        }),
        call(
            'image',
            'image_gen',
            ['39:56.034', '40:19.940'],
            { id: 'exec-0b470f15' },
            {
                output: {
                    path: 'generated-images/20261006-174019-exec-0b470f15.png',
                    revisedPrompt:
                        'A small friendly pixel-art lighthouse on a foggy shoreline at dusk',
                    savedPath:
                        '/Users/zknicker/.haus/dev/agents/agt_swCs1/home/.codex/generated_images/exec-0b470f15.png',
                },
            }
        ),
        call('upload', 'bash', ['40:27.209', '40:27.683'], {
            command: "haus attachment upload --path 'exec-0b470f15.png'",
            ...ws,
        }),
    ],
    {
        reasoning: [
            think('r1', '39:54.377', '39:56.033', '\n\n**Calling image generation tool**'),
            think(
                'r2',
                '40:48.661',
                '40:49.434',
                '\n\n**Resolving final output format**\n\n**Confirming minimal final response**'
            ),
        ],
    }
);
