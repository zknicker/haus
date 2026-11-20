Files in this directory are ported from [pi-web-search](https://github.com/ttttmr/pi-web-search) 1.7.0 by ttttmr under its MIT license (`LICENSE`), adapted to Haus types: Zod parsing at the boundary instead of untyped reads, and each piece trimmed to what the runner's providers use (the ChatGPT plan, xAI, Gemini, and OpenRouter). Upstream declares MIT in `package.json` and ships no license file, so `LICENSE` is the standard MIT text naming the package author and the year of its first commit.

Haus does not run pi-web-search as a Pi extension. Its request side calls each provider from a `web_search` tool of its own; Haus hosts the search inside the Agent's own request instead, so only the response handling is ported.

| File | Upstream path | Upstream commit | License |
| --- | --- | --- | --- |
| `search-url.ts` | `src/providers/results.ts` (`normalizeSearchUrl`; `lang` is kept, since it can choose the page's content) | `9442b123c9dc56fcc659cdd013c9e6da0374235e` | MIT |
| `grounding-redirects.ts` | `src/providers/google.ts` (`isGoogleGroundingRedirect`, `resolveGoogleGroundingRedirectUrls`; returns a map instead of rewriting results in place, an aborted search throws instead of keeping its redirects, and each `HEAD` has its own 5 second timeout, so one that never answers leaves its link as Gemini sent it instead of stalling the search) | `9442b123c9dc56fcc659cdd013c9e6da0374235e` | MIT |
| `url-citation.ts` | `src/providers/openai.ts` (`extractOpenAIUrlCitation`: the flat Responses annotation and the nested Chat Completions `url_citation`; a missing title stays empty instead of a path segment) | `9442b123c9dc56fcc659cdd013c9e6da0374235e` | MIT |
| `anthropic-search-events.ts` | `src/providers/anthropic.ts` (`createAnthropicSearchStream` event handling: `server_tool_use`, `web_search_tool_result`, `citations_delta`; reading the query from the streamed `input_json_delta` is Haus's) | `9442b123c9dc56fcc659cdd013c9e6da0374235e` | MIT |
| `../../hosted-search-notes.ts` | `src/providers/openai.ts` (`collectWebSearchCall`: the page an `open_page` or `find_in_page` action names) | `9442b123c9dc56fcc659cdd013c9e6da0374235e` | MIT |
| `grounding-redirects.test.ts` | Haus's own | n/a | n/a |
