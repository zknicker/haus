/** Workspace files Blippy's seeded #product message links, keyed by workspace-relative path. */
export const developmentArtifactFiles = {
    notes: {
        path: 'notes/tab-strip-polish.md',
        content: `# Tab strip polish notes

Where the desktop workspace tabs still feel rough, in the order I'd fix them.

## Must fix

- **Selected tab weight.** The selected tab should read as selected without growing. Keep its size and shape; let the surface carry the state.
- **Close button room.** Show the close button only on the selected tab and on hover or focus, so unselected titles keep their width.
- **Overflow.** Tabs shrink evenly down to mark-only. The plus button stays pinned after the last tab and the strip never scrolls.

## Nice to have

- Tooltips that add the chat an artifact came from and its path.
- A spinner mark while a page loads, falling back to a globe when a site has no icon.

## Open questions

1. Should reopening an artifact from another chat reuse its tab? Today identity is Agent plus path, so yes.
2. Do artifact tabs need their own restore order after a restart, or is "among themselves" enough?
`,
    },
    page: {
        path: 'workbench/tab-strip-states.html',
        title: 'Tab strip states',
        content: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tab strip states</title>
<style>
  body {
    margin: 0;
    padding: var(--pad-lg, 24px);
    background: var(--background, #fff);
    color: var(--foreground, #111);
    font: 14px/1.5 var(--font-sans, system-ui, sans-serif);
  }
  h1 { margin: 0 0 4px; font-size: 18px; }
  p { margin: 0 0 20px; color: var(--muted-foreground, #666); }
  .state { margin-bottom: 20px; }
  .label { margin-bottom: 8px; font-size: 12px; color: var(--muted-foreground, #666); }
  .strip {
    display: flex;
    gap: 4px;
    padding: 6px;
    border: 1px solid var(--border, #e5e5e5);
    border-radius: var(--radius, 10px);
    background: var(--surface-secondary, #f5f5f5);
  }
  .tab {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    max-width: 180px;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-radius: calc(var(--radius, 10px) - 4px);
    white-space: nowrap;
  }
  .tab.selected { background: var(--background, #fff); }
  .mark { flex: none; width: 14px; height: 14px; border-radius: 4px; background: var(--accent-bg, #d6e4ff); }
  .title { overflow: hidden; text-overflow: ellipsis; }
  .close { margin-left: auto; color: var(--muted-foreground, #666); }
  .compact .tab { flex: 0 0 auto; }
</style>
</head>
<body>
  <h1>Tab strip states</h1>
  <p>How the strip behaves as tabs are added. The selected tab keeps its size; only its surface changes.</p>

  <div class="state">
    <div class="label">Roomy: titles fit, close button on the selected tab</div>
    <div class="strip">
      <div class="tab"><span class="mark"></span><span class="title">#product</span></div>
      <div class="tab selected"><span class="mark"></span><span class="title">Tab strip polish notes</span><span class="close">×</span></div>
      <div class="tab"><span class="mark"></span><span class="title">haus.chat</span></div>
    </div>
  </div>

  <div class="state">
    <div class="label">Crowded: titles end in an ellipsis</div>
    <div class="strip">
      <div class="tab"><span class="mark"></span><span class="title">#product</span></div>
      <div class="tab"><span class="mark"></span><span class="title">Tab strip polish notes</span></div>
      <div class="tab selected"><span class="mark"></span><span class="title">Tab strip states</span><span class="close">×</span></div>
      <div class="tab"><span class="mark"></span><span class="title">HeroUI Pro components</span></div>
      <div class="tab"><span class="mark"></span><span class="title">Release checklist</span></div>
    </div>
  </div>

  <div class="state compact">
    <div class="label">Full: mark-only tabs, selected keeps its close button</div>
    <div class="strip">
      <div class="tab"><span class="mark"></span></div>
      <div class="tab"><span class="mark"></span></div>
      <div class="tab selected"><span class="mark"></span><span class="close">×</span></div>
      <div class="tab"><span class="mark"></span></div>
      <div class="tab"><span class="mark"></span></div>
      <div class="tab"><span class="mark"></span></div>
    </div>
  </div>
</body>
</html>
`,
    },
} as const;

/** Blippy's message: a `haus://workspace` link to the notes and an `artifact` card for the page. */
export const developmentArtifactMessageContent = `Pulled the tab strip feedback into [Tab strip polish notes](haus://workspace/${developmentArtifactFiles.notes.path}). I also mocked the strip states so we can compare them side by side:

\`\`\`artifact
${JSON.stringify({ path: developmentArtifactFiles.page.path, title: developmentArtifactFiles.page.title })}
\`\`\``;
