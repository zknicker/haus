import Foundation

/// The Cloud Agent work link, `[<label>](cloud-agent://<workId>)` (ADR 0044).
///
/// The phone's half of `packages/haus-api/src/cloud-agent-work-link.ts` and
/// the `cloud-agent-work` arm of `parseHausRichReferences`: the label is the
/// work title with line breaks as spaces, `]` dropped, and `\` and `[`
/// escaped, falling back to "Cloud Agent work" when nothing is left. Change
/// both sides together.
public enum CloudAgentWorkLink {
    public static let fallbackLabel = "Cloud Agent work"
    /// `cloudAgentTitleMaxLength`: a label keeps at most this many characters.
    public static let titleMaxLength = 120

    /// One link the content carries.
    public struct Occurrence: Hashable, Sendable {
        public let range: Range<String.Index>
        public let workID: String
        /// The unescaped label: the title as the author's link wrote it.
        public let label: String
    }

    /// The work id a `cloud-agent://` target names, or nil for any other target.
    public static func workID(target rawTarget: String) -> String? {
        let target = rawTarget.trimmingCharacters(in: .whitespaces)
        guard target.hasPrefix(prefix) else { return nil }
        let encoded = String(target.dropFirst(prefix.count))
        guard !encoded.isEmpty, let id = encoded.removingPercentEncoding, !id.isEmpty else { return nil }
        return id
    }

    /// Undoes the escapes `label(title:)` writes: `\\` → `\`, `\[` → `[`.
    public static func unescapedLabel(_ raw: String) -> String {
        let characters = Array(raw.unicodeScalars)
        var result = String.UnicodeScalarView()
        var index = 0
        while index < characters.count {
            let character = characters[index]
            if character == "\\", index + 1 < characters.count,
               characters[index + 1] == "\\" || characters[index + 1] == "[" {
                result.append(characters[index + 1])
                index += 2
            } else {
                // A backslash before anything else stays, as in the App's parser.
                result.append(character)
                index += 1
            }
        }
        return String(result)
    }

    /// The escaped label a link for `title` carries, mirroring
    /// `cloudAgentWorkLinkLabel`.
    public static func label(title: String) -> String {
        let plain = title
            .replacingOccurrences(of: #"[\r\n]+"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: "]", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let clipped = String(plain.unicodeScalars.prefix(titleMaxLength))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clipped.isEmpty else { return fallbackLabel }
        return clipped
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "[", with: "\\[")
    }

    /// The whole link for one work, mirroring `formatCloudAgentWorkLink`.
    public static func format(title: String, workID: String) -> String {
        let trimmed = workID.trimmingCharacters(in: .whitespaces)
        let encoded = trimmed.addingPercentEncoding(withAllowedCharacters: uriComponentAllowed) ?? trimmed
        return "[\(label(title: title))](\(prefix)\(encoded))"
    }

    /// Every Cloud Agent work link in `content`, in order, read with the
    /// shared link grammar.
    public static func occurrences(in content: String) -> [Occurrence] {
        guard let expression = linkExpression else { return [] }
        return expression
            .matches(in: content, range: NSRange(content.startIndex..., in: content))
            .compactMap { match in
                guard let range = Range(match.range(at: 0), in: content),
                      let labelRange = Range(match.range(at: 1), in: content),
                      let targetRange = Range(match.range(at: 2), in: content),
                      let workID = workID(target: String(content[targetRange]))
                else { return nil }
                // `![…](…)` is an image on both clients, never a reference.
                if range.lowerBound > content.startIndex,
                   content[content.index(before: range.lowerBound)] == "!" {
                    return nil
                }
                return Occurrence(
                    range: range,
                    workID: workID,
                    label: unescapedLabel(String(content[labelRange]))
                )
            }
    }

    /// The content with its final paragraph hidden when that paragraph is
    /// only Cloud Agent work links and every one of them is backed by the
    /// Message's recorded links (ADR 0044, Q1). The card below the Message
    /// already shows that work; a forged, unknown, or unrecorded link stays
    /// readable.
    public static func elidingBackedTrailingParagraph(
        _ content: String,
        backedWorkIDs: Set<String>
    ) -> String {
        guard !backedWorkIDs.isEmpty else { return content }
        let trimmedEnd = content.endIndexTrimmingTrailingWhitespace
        let paragraphStart = content.startOfFinalParagraph(before: trimmedEnd)
        let paragraph = paragraphStart..<trimmedEnd
        guard !paragraph.isEmpty else { return content }

        let links = occurrences(in: content).filter {
            $0.range.lowerBound >= paragraph.lowerBound && $0.range.upperBound <= paragraph.upperBound
        }
        guard !links.isEmpty, links.allSatisfy({ backedWorkIDs.contains($0.workID) }) else { return content }

        var cursor = paragraph.lowerBound
        for link in links {
            guard content[cursor..<link.range.lowerBound].allSatisfy(\.isWhitespace) else { return content }
            cursor = link.range.upperBound
        }
        guard content[cursor..<paragraph.upperBound].allSatisfy(\.isWhitespace) else { return content }

        return String(content[..<paragraphStart]).trimmingTrailingWhitespace
    }

    private static let prefix = "cloud-agent://"
    private static let linkExpression = try? NSRegularExpression(pattern: #"\[([^\]\n]+)\]\(([^\)\n]+)\)"#)
    /// `encodeURIComponent`'s unreserved set.
    private static let uriComponentAllowed = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()"
    )
}

private extension String {
    var endIndexTrimmingTrailingWhitespace: String.Index {
        var end = endIndex
        while end > startIndex, self[index(before: end)].isWhitespace {
            end = index(before: end)
        }
        return end
    }

    var trimmingTrailingWhitespace: String {
        String(self[..<endIndexTrimmingTrailingWhitespace])
    }

    /// Where the paragraph ending at `end` begins: just past the last blank
    /// line before it, or the start of the content.
    func startOfFinalParagraph(before end: String.Index) -> String.Index {
        var lineStart = end
        while lineStart > startIndex {
            // Walk back to the start of the current line.
            var cursor = lineStart
            while cursor > startIndex, !self[index(before: cursor)].isNewline {
                cursor = index(before: cursor)
            }
            guard cursor > startIndex else { return startIndex }
            // `cursor` follows a newline; the line before it is blank when
            // it holds only whitespace.
            let previousEnd = index(before: cursor)
            var previousStart = previousEnd
            while previousStart > startIndex, !self[index(before: previousStart)].isNewline {
                previousStart = index(before: previousStart)
            }
            if self[previousStart..<previousEnd].allSatisfy(\.isWhitespace) {
                return cursor
            }
            lineStart = previousEnd
        }
        return startIndex
    }
}
