import Foundation

/// The document a visual fence renders inside.
///
/// A port of the web card's `buildVisualSrcDoc`
/// (`apps/website/src/features/chats/visual-card.tsx`): the same CSP, the same
/// base styles, the app's resolved token snapshot as `:root`, and a host-owned
/// size reporter — then the model body LAST, so a partially streamed body still
/// parses and the error-tolerant HTML parser is the streaming renderer.
///
/// Treat the body as attacker-controlled. Containment is the load, not the
/// markup: `WKWebView.loadHTMLString(_, baseURL: nil)` gives the document an
/// opaque origin — the native answer to the web's sandboxed iframe — the data
/// store is non-persistent, and the CSP below pins every reachable external
/// source to an exact CDN file.
public enum VisualSandboxDocument {
    /// The allowed external scripts, pinned by version. Bumping a pin — or
    /// adding one — is a deliberate supply-chain decision shared with the web
    /// card and the seeded skill guidance (docs/internals/widgets.md).
    public static let chartJsURL =
        "https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"
    public static let d3URL = "https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"
    public static let topojsonClientURL =
        "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js"

    /// The allowed `fetch` targets: map topology, pinned to the exact atlas
    /// file. A choropleth needs real geometry, and these are the only two
    /// responses the frame may read — `connect-src` is otherwise the
    /// exfiltration channel, so it lists files, never an origin.
    public static let usAtlasStatesURL =
        "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json"
    public static let worldAtlasCountriesURL =
        "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json"

    /// The WebKit handler the frame posts its measured height to, beside the
    /// web's `postMessage` channel.
    public static let sizeMessageName = "hausVisualSize"

    static func make(
        html: String,
        scheme: AgentHtmlColorScheme,
        typography: VisualTypography
    ) -> String {
        [
            "<!doctype html><html><head><meta charset=\"utf-8\">",
            "<meta http-equiv=\"Content-Security-Policy\" content=\"\(csp)\">",
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
            "<style>",
            ":root { color-scheme: \(scheme.rawValue); \n\(rootDeclarations(scheme, typography)) }",
            baseStyles,
            "</style>",
            "<script>\(sizeReporterScript)</script>",
            "</head><body>",
            html,
            "</body></html>",
        ].joined(separator: "\n")
    }

    /// The generated token table, then the Dynamic Type override. Source
    /// order is what settles the conflict, so the override comes last — see
    /// `VisualTypography` for why iOS diverges here and nowhere else.
    static func rootDeclarations(
        _ scheme: AgentHtmlColorScheme,
        _ typography: VisualTypography
    ) -> String {
        "\(tokenDeclarations(for: scheme))\n\(typography.declarations)"
    }

    static func tokenDeclarations(for scheme: AgentHtmlColorScheme) -> String {
        AgentHtmlTokens.table(for: scheme)
            .map { "\($0.name): \($0.value);" }
            .joined(separator: "\n")
    }

    // Chart.js keeps its versioned-directory prefix; the map libraries are
    // narrowed all the way to the file.
    private static let csp = [
        "default-src 'none'",
        "script-src 'unsafe-inline' https://cdn.jsdelivr.net/npm/chart.js@4.5.1/"
            + " \(d3URL) \(topojsonClientURL)",
        "style-src 'unsafe-inline'",
        "img-src data: blob:",
        "font-src data:",
        "connect-src \(usAtlasStatesURL) \(worldAtlasCountriesURL)",
        "form-action 'none'",
        "base-uri 'none'",
    ].joined(separator: "; ")

    // Plain <table> markup wears the app's table look, so agents render tabular
    // data as bare HTML and get native theming; bare form controls wear HeroUI's
    // field and outline-button metrics for the same reason. Kept identical to
    // the web card — including the accent-color rule that keeps native controls
    // on the frame's emphasis role instead of the browser default, and the
    // sticky caption that survives the scroller the size reporter wraps a wide
    // table in — plus the text-size-adjust WebKit needs to stop inflating the
    // body font.
    private static let baseStyles = """
    * { box-sizing: border-box; }
    body { accent-color: var(--accent, currentColor); }
    body { margin: 0; padding: 8px 0; background: transparent; color: var(--foreground, inherit); font-family: var(--font-sans, system-ui, sans-serif); font-size: var(--app-ui-font-size, 14px); line-height: 1.5; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%; }
    table { width: 100%; border-collapse: collapse; caption-side: bottom; font-size: var(--app-ui-font-size, 14px); }
    th { padding: 8px 12px; text-align: left; vertical-align: middle; font-weight: 500; color: var(--foreground); line-height: 1.1; }
    td { padding: 8px 12px; vertical-align: middle; color: var(--muted-foreground); line-height: 1.2; }
    tr { border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent); }
    tbody tr:hover { background: color-mix(in srgb, var(--foreground) 5%, transparent); }
    tfoot { font-weight: 500; } tfoot tr { border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent); border-bottom: none; }
    caption { position: sticky; left: 0; width: max-content; max-width: 100%; margin-top: 12px; color: var(--muted-foreground); text-align: left; }
    input, select, textarea { font: inherit; color: var(--foreground); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--pad-sm) var(--pad-md); }
    button { font: inherit; font-weight: 500; color: var(--foreground); background: transparent; border: 1px solid var(--border); border-radius: var(--radius); padding: var(--pad-sm) var(--pad-md); cursor: pointer; }
    button:hover { background: var(--surface-secondary); }
    input[type="range"] { width: 100%; padding: 0; border: none; background: transparent; }
    :is(input, select, textarea, button):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    """

    // Host-owned plumbing, not a fence capability: reports the document height
    // so the host can fit content inside its clamp. The web channel stays for
    // parity with the iframe; the WebKit handler is what the native card reads.
    // The parent trusts nothing else from the frame and clamps what arrives.
    private static let sizeReporterScript = """
    (function () {
    // The frame does not scroll, so a table wider than the body would
    // simply be cut off. Each table gets its own horizontal scroller before the
    // first size report; table layout itself is untouched, so a narrow table
    // still spans the full width.
    var wrapWideTables = function () {
        var tables = document.querySelectorAll('table');
        for (var i = 0; i < tables.length; i += 1) {
            var table = tables[i];
            var parent = table.parentNode;
            if (!parent || (parent.getAttribute
                && parent.getAttribute('data-haus-table-scroll') === 'true')) {
                continue;
            }
            var wrapper = document.createElement('div');
            wrapper.setAttribute('data-haus-table-scroll', 'true');
            wrapper.setAttribute(
                'style',
                'overflow-x: auto; max-width: 100%; -webkit-overflow-scrolling: touch;'
            );
            parent.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        }
    };
    var report = function () {
            // Body offsetHeight fits content; documentElement.scrollHeight never
            // shrinks below the frame's own height, so it cannot shrink-to-fit.
            var body = document.body;
            var height = Math.ceil(body ? body.offsetHeight : document.documentElement.scrollHeight);
            parent.postMessage({ height: height, type: 'haus-visual-size' }, '*');
            var webkit = window.webkit;
            if (webkit && webkit.messageHandlers && webkit.messageHandlers.hausVisualSize) {
                webkit.messageHandlers.hausVisualSize.postMessage(height);
            }
        };
        addEventListener('DOMContentLoaded', function () {
            wrapWideTables();
            report();
            if (typeof ResizeObserver === 'function' && document.body) {
                new ResizeObserver(report).observe(document.body);
            }
        });
        addEventListener('load', report);
    })();
    """
}
