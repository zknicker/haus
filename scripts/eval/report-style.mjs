// The eval report's stylesheet: one reading column, result bars, and
// side-by-side chat panes, with light and dark tokens. Kept apart from the
// renderer so the markup stays readable.

export const reportFonts =
    'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';

const lightTokens =
    '--bg:#f7f6f2; --fg:#1d1c1a; --muted:#6b6862; --line:#d9d6ce; --panel:#ffffff; --accent:#8a4b1f; --good:#2f7d4f; --bad:#b0372b; --warn:#a4731c; --soft:#efede7;';
const darkTokens =
    '--bg:#161614; --fg:#ebe8e1; --muted:#9a968d; --line:#33322e; --panel:#1f1e1b; --accent:#d08a52; --good:#6fc48f; --bad:#e77a6c; --warn:#d9a94a; --soft:#242320; color-scheme:dark;';

export const reportCss = `
:root{${lightTokens}
  --font:"IBM Plex Sans",system-ui,-apple-system,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${darkTokens}}}
:root[data-theme="dark"]{${darkTokens}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font);font-size:16px;line-height:1.55;padding-block:32px 64px;padding-inline:16px}
main{max-width:960px;margin:0 auto;display:grid;gap:44px}
h1{font-size:30px;font-weight:600;margin:0 0 6px;text-wrap:balance}
h2{font-size:22px;font-weight:600;margin:0 0 12px;text-wrap:balance}
h3{font-size:17px;font-weight:600;margin:0 0 8px}
h4{font-size:15px;font-weight:600;margin:0 0 6px}
p{max-width:66ch;margin:0 0 12px}
code{font-family:var(--mono);font-size:.9em;background:var(--soft);padding:1px 5px;border-radius:4px}
a{color:var(--accent)}
.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.lede{color:var(--muted);font-size:17px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px 16px}
.kpi .n{font-size:30px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.1}
.kpi .l{font-size:13px;color:var(--muted);margin-top:6px}
.kpi.good .n{color:var(--good)} .kpi.bad .n{color:var(--bad)}
.bars{display:grid;gap:12px}
.bar-row{display:grid;grid-template-columns:260px 1fr;gap:14px;align-items:center}
.bar-row .lab{font-size:14px;overflow-wrap:anywhere}
.bar-row .lab small{display:block;color:var(--muted)}
.tracks{display:grid;gap:4px}
.track{display:grid;grid-template-columns:90px 1fr 64px;gap:8px;align-items:center;font-size:12px}
.track .who{color:var(--muted)}
.track .rail{height:10px;background:var(--soft);border-radius:3px;overflow:hidden}
.track .fill{height:100%;border-radius:3px}
.fill.base{background:var(--muted)} .fill.worse{background:var(--bad)} .fill.better{background:var(--good)}
.track .v{text-align:right;color:var(--muted);font-variant-numeric:tabular-nums}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:8px;background:var(--panel)}
table{border-collapse:collapse;width:100%;font-size:14px}
th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:500;text-align:left;padding:10px 12px}
td{padding:9px 12px;border-top:1px solid var(--line);vertical-align:top}
td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
td small{display:block;color:var(--muted)}
.causes{color:var(--muted);font-size:13px}
.chat{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px}
.pane{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px;min-width:0}
.pane .ph{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px;font-size:12px;color:var(--muted)}
.pane .ph b{color:var(--fg);font-size:14px}
.msg{display:grid;grid-template-columns:52px 1fr;gap:8px;padding:7px 0;border-top:1px solid var(--line);font-size:14px}
.msg:first-of-type{border-top:0}
.msg .who{font-size:11px;color:var(--muted);padding-top:3px}
.msg .body{min-width:0;overflow-wrap:anywhere;white-space:pre-line}
.msg .body.thread{padding-left:12px;border-left:2px solid var(--line);color:var(--muted)}
.tag{display:inline-block;font-size:11px;padding:1px 7px;border-radius:999px;margin-left:6px;vertical-align:middle;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.tag.ok{border-color:var(--good);color:var(--good)} .tag.bad{border-color:var(--bad);color:var(--bad)} .tag.warn{border-color:var(--warn);color:var(--warn)}
.verdict{font-size:13px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)}
.verdict.ok{color:var(--good)} .verdict.bad{color:var(--bad)} .verdict.warn{color:var(--warn)}
.empty{color:var(--muted);font-size:14px}
.note{background:var(--soft);border-left:3px solid var(--accent);padding:12px 16px;border-radius:0 6px 6px 0;max-width:70ch}
.notes ol,.notes ul{max-width:70ch;padding-left:20px} .notes li{margin:6px 0}
ul.caveats{max-width:70ch;padding-left:20px;margin:0} ul.caveats li{margin:6px 0}
@media (max-width:640px){.bar-row{grid-template-columns:1fr} .track{grid-template-columns:70px 1fr 56px}}
`;
