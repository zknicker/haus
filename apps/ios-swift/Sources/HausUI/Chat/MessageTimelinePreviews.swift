import SwiftUI

#Preview {
    MessageTimelineView(messages: ChatFixtures.messages, onOpenThread: { _ in })
}

#Preview("Empty") {
    MessageTimelineView(
        messages: [],
        emptyStateDescription: "Start the conversation in #product.",
        onOpenThread: { _ in }
    )
}

/// Every block a reply can be written in, in one body — the Markdown the
/// visuals skill now tells Agents to put their tables, lists, and explanation
/// in, with a chip inside a table cell and a fence that must stay literal.
#Preview("Markdown") {
    ScrollView {
        RichMessageContentView(
            blocks: RichMessageBlockParser.blocks(markdownPreviewBody) { _, _, _ in nil }
        )
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private let markdownPreviewBody = """
## Last week's runs

Three agents ran and **two** finished clean. The third is *still* retrying — \
see `haus agents logs --since **7d**` or ask [@Cove](agent://agt_cove).

| Agent | Runs | Clean |
| :--- | ---: | :-: |
| [@Cove](agent://agt_cove) | 12 | yes |
| Juniper | 4 | no |
| Marlow | 1 | yes |

What to do next:

- Retry the ~~failed~~ stuck run
  - It needs the new token
  - Then re-run the eval
- Close the old issue

> Nothing here blocks the release.

```bash
# not a heading, and | is not a table
haus agents run --agent cove --retry
```

---

Read https://haus.dev/runs for the rest.
"""
