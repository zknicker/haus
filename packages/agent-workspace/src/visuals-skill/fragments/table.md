# Table

Tables live in the reply as Markdown; right-align numeric columns with `---:`.
The `<table>` fragment is for the interactive or bounded-record case only — the
frame already styles bare `<table>` markup and scrolls a wide one.

```html
<table>
  <caption>Spend by channel, June 2026</caption>
  <thead><tr><th>Channel</th><th style="text-align:right">Spend</th><th style="text-align:right">ROAS</th></tr></thead>
  <tbody>
    <tr><td>Search</td><td style="text-align:right">$42,300</td><td style="text-align:right">3.1×</td></tr>
    <tr><td>Social</td><td style="text-align:right">$18,900</td><td style="text-align:right">2.4×</td></tr>
  </tbody>
</table>
```
