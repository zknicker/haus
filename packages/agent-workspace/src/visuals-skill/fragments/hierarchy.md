# Hierarchy

A root over its branches, drawn in CSS so every label stays real text. The rail
reaches the outer branches' centers exactly: with three equal columns those sit
at a sixth and five sixths, so `left` and `right` are `100% / 6`. Two levels of
boxes is the ceiling — the third level is lines inside the branch.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Tees are 58% of the 1,450 units sold, and crew necks alone are 42% of the catalog.</h2>
<style>
  .tree { display: flex; justify-content: center; position: relative; }
  .tree::after { content: ''; position: absolute; left: 50%; bottom: -22px; width: 1px; height: 22px; background: var(--border-strong); }
  .kids { display: flex; margin-top: 44px; position: relative; }
  .kids::before { content: ''; position: absolute; top: -22px; left: calc(100% / 6); right: calc(100% / 6); height: 1px; background: var(--border-strong); }
  .kid { position: relative; flex: 1 1 0; min-width: 0; padding: 0 4px; }
  .kid::before { content: ''; position: absolute; top: -22px; left: 50%; width: 1px; height: 22px; background: var(--border-strong); }
  .node { background: var(--surface-secondary); border-radius: var(--radius); padding: var(--pad-sm) var(--pad-md); }
  .leaf { display: flex; justify-content: space-between; gap: var(--gap-sm); font-size: 12px; color: var(--muted-foreground); margin-top: 2px; }
</style>
<div class="tree">
  <div class="node" style="text-align:center">
    <div style="font-weight:500">All products</div>
    <div style="font-size:12px;color:var(--muted-foreground)">1,450 units · 30 days</div>
  </div>
</div>
<div class="kids">
  <div class="kid">
    <div class="node">
      <div style="font-weight:500">Tees · 841</div>
      <div class="leaf"><span>Crew neck</span><span>612</span></div>
      <div class="leaf"><span>V-neck</span><span>229</span></div>
    </div>
  </div>
  <div class="kid">
    <div class="node">
      <div style="font-weight:500">Hoodies · 247</div>
      <div class="leaf"><span>Pullover</span><span>180</span></div>
      <div class="leaf"><span>Zip</span><span>67</span></div>
    </div>
  </div>
  <div class="kid">
    <div class="node">
      <div style="font-weight:500">Other · 362</div>
      <div class="leaf"><span>Tanks</span><span>160</span></div>
      <div class="leaf"><span>Mugs and totes</span><span>202</span></div>
    </div>
  </div>
</div>
```
