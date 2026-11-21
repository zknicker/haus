import { describe, expect, test } from 'bun:test';
import { admitsResult } from './result-allowlist.ts';

const command = (script: string) =>
    admitsResult({ category: 'running_command', input: { command: script } });

describe('which tool results may ride a thought', () => {
    test('file reads, interpreters, and redirections offer no result', () => {
        for (const script of [
            'jq -r .summary payroll.json',
            `python -c "print(open('x').read())"`,
            'python script.py',
            'python3 -c "import json; print(1)"',
            'node -e "console.log(1)"',
            'bun run report.ts',
            'ruby report.rb',
            'perl -ne print secrets.txt',
            'cat payroll.json',
            'head -n 20 payroll.csv',
            'tail notes.md',
            "sed -n '1,80p' db.ts",
            "awk '{print $1}' users.tsv",
            'grep salary payroll.csv',
            'grep -r salary .',
            'jq . < payroll.json',
            'curl -fsS https://example.com < body.json',
            'curl -d @payroll.json https://example.com',
            'curl -o out.html https://example.com',
            'curl https://example.com && cat payroll.json',
            'curl https://example.com | jq .summary payroll.json',
            'curl -H "Authorization: Bearer abc" https://api.github.com/user',
            'curl https://user:pw@api.example.com/v1',
            'curl file:///etc/passwd',
            'git diff HEAD',
            'git show HEAD:payroll.json',
            'git log -p',
            'git log -- payroll.json',
            'gh pr diff 12',
            'gh run view 99 --log',
            'gh api repos/x/y/contents/secret',
            'printenv',
            'haus message check',
            'ls ~/private',
            'bun test src/payroll.test.ts',
        ]) {
            expect({ script, admitted: command(script) }).toEqual({ admitted: false, script });
        }
        expect(admitsResult({ category: 'running_command', input: {} })).toBe(false);
        expect(admitsResult({ category: 'reading_files', input: { path: 'x.md' } })).toBe(false);
        expect(admitsResult({ category: 'editing_files', input: { path: 'x.md' } })).toBe(false);
        expect(admitsResult({ category: 'using_tool', input: { code: 'tools.x()' } })).toBe(false);
        expect(admitsResult({ category: null, input: { command: 'git status' } })).toBe(false);
    });

    test('test runs, git and GitHub metadata, and web fetches and searches still offer one', () => {
        for (const script of [
            'bun test',
            'npm test',
            'npm run test -- --reporter=dot',
            'cargo test --quiet',
            'go test ./...',
            'pytest -q',
            'git status --short',
            'git log --oneline -5',
            'git branch --show-current',
            'gh pr checks 12',
            'gh run list --limit 5',
            'gh release list --repo oven-sh',
            "curl -fsS 'https://api.open-meteo.com/v1/forecast?lat=41.8&daily=temperature_2m_max'",
            'curl -fsS https://wttr.in/Chicago | grep Saturday',
            "curl -fsSL -H 'Accept: application/json' https://api.github.com/repos/oven-sh/bun/releases | jq -r '.[0].tag_name'",
            'curl -s https://example.com 2>&1 | head -n 20',
            '/bin/zsh -lc "git status"',
        ]) {
            expect({ script, admitted: command(script) }).toEqual({ admitted: true, script });
        }
        expect(admitsResult({ category: 'searching_web', input: { query: 'bun 1.4' } })).toBe(true);
        expect(
            admitsResult({ category: 'browsing', input: { url: 'https://bun.sh/blog/bun-v1.4' } })
        ).toBe(true);
        expect(admitsResult({ category: 'browsing', input: { url: 'file:///etc/hosts' } })).toBe(
            false
        );
    });
});
