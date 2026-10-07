import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildTraceJsonNodes,
    formatTraceJsonCopy,
    readTraceJson,
    readTraceJsonOpenIds,
    summarizeTraceJson,
    type TraceJsonNode,
    traceJsonStringChars,
    truncateTraceJsonString,
} from './turn-trace-json-model.ts';
import { traceTextMaxChars } from './turn-trace-values.ts';

test('a payload is a tree when it is, or parses as, a JSON object or array', () => {
    assert.deepEqual(readTraceJson({ team: 'PRD' }), { team: 'PRD' });
    assert.deepEqual(readTraceJson([1, 2]), [1, 2]);
    assert.deepEqual(readTraceJson('  {"ok": true}\n'), { ok: true });
    assert.deepEqual(readTraceJson('[{"id": 1}]'), [{ id: 1 }]);

    assert.equal(readTraceJson('plain output'), null);
    assert.equal(readTraceJson('{not json'), null);
    assert.equal(readTraceJson('"a string"'), null);
    assert.equal(readTraceJson('42'), null);
    assert.equal(readTraceJson(42), null);
    assert.equal(readTraceJson(null), null);
    assert.equal(readTraceJson(new Date(0)), null);
    assert.equal(readTraceJson(`[${'1,'.repeat(traceTextMaxChars)}1]`), null);
});

test('rows carry their level, a closed container states its size, and ids never collide', () => {
    const nodes = buildTraceJsonNodes({ a: { b: 1 }, 'a.b': 2, list: [true, null, 'x'] });

    assert.deepEqual(
        nodes.map((node) => [node.label, node.kind, node.level]),
        [
            ['a', 'object', 1],
            ['a.b', 'number', 1],
            ['list', 'array', 1],
        ]
    );
    const ids = new Set<string>();
    const walk = (list: readonly TraceJsonNode[]) => {
        for (const node of list) {
            assert.ok(!ids.has(node.id), `duplicate id ${node.id}`);
            ids.add(node.id);
            if ('children' in node) {
                walk(node.children);
            }
        }
    };
    walk(nodes);
    assert.equal(summarizeTraceJson({ a: 1 }), '{1 key}');
    assert.equal(summarizeTraceJson({ a: 1, b: 2, c: 3 }), '{3 keys}');
    assert.equal(summarizeTraceJson(Array.from({ length: 12 })), '[12]');
    const list = nodes[2];
    assert.ok(list && 'children' in list);
    assert.deepEqual(
        list.children.map((node) => ('text' in node ? [node.kind, node.text] : null)),
        [
            ['boolean', 'true'],
            ['null', 'null'],
            ['string', 'x'],
        ]
    );
});

test('a tree opens its first level and keeps deeper or very wide containers closed', () => {
    const nodes = buildTraceJsonNodes({
        deep: { inner: { leaf: 1 } },
        wide: Array.from({ length: 80 }, (_, index) => index),
    });

    assert.deepEqual(readTraceJsonOpenIds(nodes), ['$["deep"]']);
});

test('a long string folds to one line and says how much it holds back', () => {
    const short = 'x'.repeat(traceJsonStringChars);
    assert.deepEqual(truncateTraceJsonString(short), { hiddenChars: 0, text: short });

    const long = truncateTraceJsonString('y'.repeat(traceJsonStringChars + 30));
    assert.equal(long.hiddenChars, 30);
    assert.equal(long.text, `${'y'.repeat(traceJsonStringChars)}…`);
});

test('copying a row copies a string bare and anything else as indented JSON', () => {
    assert.equal(formatTraceJsonCopy('PRD-412'), 'PRD-412');
    assert.equal(formatTraceJsonCopy(12), '12');
    assert.equal(formatTraceJsonCopy({ a: [1] }), '{\n  "a": [\n    1\n  ]\n}');
});
