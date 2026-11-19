Files in this directory are ported from [Pi](https://github.com/earendil-works/pi) under its MIT license (`LICENSE`), adapted to Haus types.

| File | Upstream path | Upstream commit | License |
| --- | --- | --- | --- |
| `truncate.ts` | `packages/coding-agent/src/core/tools/truncate.ts` | `3107a58d2e9a1b426a94bf877bd58dd1282cd1ae` | MIT |
| `truncate.test.ts` | `packages/coding-agent/test/truncate-surrogates.test.ts` | `3107a58d2e9a1b426a94bf877bd58dd1282cd1ae` | MIT |
| `edit-diff.ts` | `packages/coding-agent/src/core/tools/edit-diff.ts`, `packages/coding-agent/src/core/tools/edit.ts` (BOM and line-ending splice), `packages/coding-agent/src/utils/text.ts` (`splitBom`) | `3107a58d2e9a1b426a94bf877bd58dd1282cd1ae` | MIT |
| `fuzzy-match.ts` | `packages/coding-agent/src/core/tools/edit-diff.ts` | `3107a58d2e9a1b426a94bf877bd58dd1282cd1ae` | MIT |
| `line-replacements.ts` | `packages/coding-agent/src/core/tools/edit-diff.ts` | `3107a58d2e9a1b426a94bf877bd58dd1282cd1ae` | MIT |
| `edit-diff.test.ts` | `packages/coding-agent/test/tools.test.ts` ("edit tool", "edit tool fuzzy matching"), `packages/coding-agent/test/suite/regressions/8337-utf8-bom-parsing.test.ts` | `3107a58d2e9a1b426a94bf877bd58dd1282cd1ae` | MIT |
| `edit-crlf.test.ts` | `packages/coding-agent/test/tools.test.ts` ("edit tool CRLF handling") | `3107a58d2e9a1b426a94bf877bd58dd1282cd1ae` | MIT |
| `../paths.ts` | `packages/coding-agent/src/core/tools/path-utils.ts`, `packages/coding-agent/src/utils/paths.ts` | `3107a58d2e9a1b426a94bf877bd58dd1282cd1ae` | MIT |
| `../editor.ts`, `../editor-view.ts`, `../files.ts` | `packages/coding-agent/src/core/tools/edit.ts`, `read.ts`, `write.ts` (adapted to Anthropic's text editor commands) | `3107a58d2e9a1b426a94bf877bd58dd1282cd1ae` | MIT |
| `shell.ts` | `packages/coding-agent/src/utils/shell.ts` (`killProcessTree`, Unix only), `packages/coding-agent/src/utils/child-process.ts` (`waitForChildProcess`; the post-exit grace is a fixed deadline that output does not extend) | `3107a58d2e9a1b426a94bf877bd58dd1282cd1ae` | MIT |
| `shell.test.ts` | `packages/coding-agent/test/shell-kill-process-tree.test.ts` (driven against real processes; the fixed-grace case is Haus's) | `3107a58d2e9a1b426a94bf877bd58dd1282cd1ae` | MIT |
| `output-tail.ts` | `packages/coding-agent/src/core/tools/output-accumulator.ts` (reduced: every chunk goes to the log file; stdout and stderr each get their own streaming decoder) | `3107a58d2e9a1b426a94bf877bd58dd1282cd1ae` | MIT |
| `../bash.ts` | `packages/coding-agent/src/core/tools/bash.ts` (`createLocalShellOperations`, the output notices and status lines; the process group is killed when the shell exits, so the background-output timeout status is gone) | `3107a58d2e9a1b426a94bf877bd58dd1282cd1ae` | MIT |
| `../bash.test.ts` | `packages/coding-agent/test/tools.test.ts` ("bash tool"; the interleaved-pipe decoding case is Haus's) | `3107a58d2e9a1b426a94bf877bd58dd1282cd1ae` | MIT |
| `tail-notice.ts` | `packages/coding-agent/src/core/tools/bash.ts` (`formatOutput` and its truncation notice, shared by `bash` and `browser`) | `3107a58d2e9a1b426a94bf877bd58dd1282cd1ae` | MIT |
