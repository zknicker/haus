import Foundation

extension RichMessageParser {
    /// Emits plain prose, chipping each clock time with an explicit zone
    /// (`TimeChipFinder`) as the moment in the viewer's zone. Code never
    /// reaches here, and a blockquote parses without a context, so both read
    /// their times as written — the App's rule. A line break is its own node
    /// there (`remark-breaks`), so no chip spans one here either.
    static func appendTimed(
        _ text: Substring,
        style: RichInlineStyle,
        timeChips: TimeChipContext?,
        resolve: (MentionPresentationKind, String, String) -> RichReferencePresentation?,
        into segments: inout [RichMessageSegment]
    ) {
        guard let context = timeChips, !text.isEmpty else {
            append(text: text, style: style, into: &segments)
            return
        }
        for (index, line) in text.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
            if index > 0 { append(text: "\n", style: style, into: &segments) }
            let line = String(line)
            var cursor = line.startIndex
            for match in TimeChipFinder.find(in: line, sentAt: context.sentAt) {
                append(text: line[cursor..<match.range.lowerBound], style: style, into: &segments)
                let id = TimeReference.id(startsAt: match.startsAt, endsAt: match.endsAt)
                let zone = context.viewerZone
                segments.append(.reference(
                    resolve(.time, id, match.text) ?? RichReferencePresentation(
                        id: id,
                        kind: .time,
                        label: TimeReference.chipLabel(match.startsAt, end: match.endsAt, zone: zone),
                        avatarURL: nil,
                        viewerTimeZone: zone
                    )
                ))
                cursor = match.range.upperBound
            }
            append(text: line[cursor...], style: style, into: &segments)
        }
    }
}
