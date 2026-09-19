import Foundation

/// What a visual is *called*, as opposed to where its fence sits: the fallback
/// label a notification, a search excerpt, or the unavailable state reads, and
/// the one-line preview that puts that label where the markup would have been.
/// Ported from `visualFallbackText` in `packages/haus-api/src/widgets/visual/
/// contracts.ts`.
extension VisualFence {
    /// The web's `visualFallbackText`: explicit title, else the document
    /// `<title>`, else the first h1-h3 text, else "Visual".
    public static func fallbackText(html: String, title: String?) -> String {
        let trimmed = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !trimmed.isEmpty {
            return String(trimmed.prefix(fallbackTextLimit))
        }
        if let documentTitle = tagText(html, matching: titleExpression) {
            return documentTitle
        }
        return tagText(html, matching: headingExpression) ?? "Visual"
    }

    /// Message content with every visual fence collapsed to its fallback text,
    /// so a one-line preview reads the visual's name instead of its markup.
    public static func previewText(_ content: String) -> String {
        let segments = split(content)
        guard segments.contains(where: { if case .visual = $0 { return true } else { return false } })
        else {
            return content
        }
        return segments.map { segment in
            switch segment {
            case let .text(text):
                text
            case let .visual(html, _, title):
                fallbackText(html: html, title: title)
            }
        }.joined()
    }

    static let fallbackTextLimit = 500

    private static let titleExpression = try? NSRegularExpression(
        pattern: #"<title[^>]*>([\s\S]*?)</title>"#,
        options: [.caseInsensitive]
    )

    private static let headingExpression = try? NSRegularExpression(
        pattern: #"<h[1-3][^>]*>([\s\S]*?)</h[1-3]>"#,
        options: [.caseInsensitive]
    )

    private static func tagText(_ html: String, matching expression: NSRegularExpression?) -> String? {
        guard let expression else { return nil }
        let source = html as NSString
        guard
            let match = expression.firstMatch(
                in: html,
                range: NSRange(location: 0, length: source.length)
            ),
            match.range(at: 1).location != NSNotFound
        else {
            return nil
        }
        let inner = source.substring(with: match.range(at: 1))
        guard !inner.isEmpty else { return nil }

        let text = inner
            .replacingOccurrences(of: "<[^>]*>", with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : String(text.prefix(fallbackTextLimit))
    }
}
