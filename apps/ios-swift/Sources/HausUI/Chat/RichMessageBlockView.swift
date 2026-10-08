import SwiftUI

/// One block of a message body, drawn.
///
/// Prose, headings, list rows, and quoted prose all go through the same inline
/// view, so a reference chip reads the same wherever it is written. Only the
/// two blocks that are not running text — a fenced code plate and a table —
/// draw themselves.
struct RichMessageBlockView: View {
    let block: RichMessageBlock
    let textStyle: Font.TextStyle
    /// How the running text in this block is set. A quote hands its children a
    /// muted one; everything else is the body's own.
    var prose: RichMessageTextAppearance = .body
    let markRevision: Int

    var body: some View {
        switch block {
        case .paragraph(let segments):
            inline(segments, appearance: prose)
        case .heading(let level, let segments):
            inline(segments, appearance: .heading(level: level))
        case .list(let items):
            RichMessageListView(
                items: items,
                textStyle: textStyle,
                prose: prose,
                markRevision: markRevision
            )
        case .quote(let blocks):
            RichMessageQuoteView(blocks: blocks, textStyle: textStyle, markRevision: markRevision)
        case .code(_, let text):
            RichMessageCodeBlockView(text: text, textStyle: textStyle)
        case .rule:
            Divider()
        case .table(let table):
            RichMessageTableView(table: table, textStyle: textStyle)
        }
    }

    private func inline(
        _ segments: [RichMessageSegment],
        appearance: RichMessageTextAppearance
    ) -> some View {
        RichMessageInlineView(
            segments: segments,
            textStyle: textStyle,
            appearance: appearance,
            markRevision: markRevision
        )
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A list, flattened: one row per item, indented by its depth, with the marker
/// the author wrote standing before the words.
///
/// Markers sit in a column as wide as the widest marker at their depth, right
/// aligned, so "9." and "10." end at the same place and the words after them
/// keep one left edge.
struct RichMessageListView: View {
    let items: [RichMessageListItem]
    let textStyle: Font.TextStyle
    var prose: RichMessageTextAppearance = .body
    let markRevision: Int

    var body: some View {
        let widest = Self.widestMarkers(items)
        VStack(alignment: .leading, spacing: 3) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                HStack(alignment: .top, spacing: 6) {
                    ZStack(alignment: .trailing) {
                        // Reserves the column's width; never drawn.
                        markerText(widest[item.depth] ?? Self.marker(item)).hidden()
                        markerText(Self.marker(item))
                    }
                    RichMessageInlineView(
                        segments: item.segments,
                        textStyle: textStyle,
                        appearance: prose,
                        markRevision: markRevision
                    )
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.leading, CGFloat(item.depth) * 16)
            }
        }
    }

    private func markerText(_ marker: String) -> some View {
        Text(marker)
            .font(.system(textStyle))
            .monospacedDigit()
            .foregroundStyle(.secondary)
    }

    nonisolated static func marker(_ item: RichMessageListItem) -> String {
        switch item.marker {
        case .bullet: "\u{2022}"
        case .ordered(let number): "\(number)."
        }
    }

    /// The longest marker at each depth. With tabular digits, the longest
    /// string is the widest one.
    nonisolated static func widestMarkers(_ items: [RichMessageListItem]) -> [Int: String] {
        items.reduce(into: [:]) { widest, item in
            let marker = Self.marker(item)
            if marker.count > (widest[item.depth]?.count ?? 0) { widest[item.depth] = marker }
        }
    }
}

/// Quoted prose: the App's start rule and muted ink, with the quote's own
/// blocks inside it.
///
/// The children are erased, which is what lets a block contain blocks without
/// the view's own type containing itself.
struct RichMessageQuoteView: View {
    let blocks: [RichMessageBlock]
    let textStyle: Font.TextStyle
    let markRevision: Int

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Capsule()
                .fill(Color.secondary.opacity(0.3))
                .frame(width: 2)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                    // Erased, which is what lets a quote hold blocks without
                    // this view's own type holding itself.
                    AnyView(
                        RichMessageBlockView(
                            block: block,
                            textStyle: textStyle,
                            prose: .quote,
                            markRevision: markRevision
                        )
                    )
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// One run of inline content, in whichever engine the platform has: the
/// transcript's own TextKit stack on the phone, plain words under the test
/// host.
struct RichMessageInlineView: View {
    let segments: [RichMessageSegment]
    let textStyle: Font.TextStyle
    var appearance: RichMessageTextAppearance = .body
    let markRevision: Int

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.legibilityWeight) private var legibilityWeight

    #if canImport(UIKit)
    var body: some View {
        RichMessageTextView(
            content: RichMessageTextView.Content(
                segments: segments,
                textStyle: textStyle,
                dynamicTypeSize: dynamicTypeSize,
                legibilityWeight: legibilityWeight,
                appearance: appearance
            ),
            markRevision: markRevision
        )
    }
    #else
    /// macOS hosts this package so the pure tests can run. There is no text
    /// engine work here — the labels read as plain words, without a capsule.
    var body: some View {
        Text(
            RichMessageInlineText.attributed(
                segments,
                textStyle: textStyle,
                appearance: appearance
            )
        )
        .textSelection(.enabled)
        .accessibilityLabel(RichMessageAttributedText.accessibilityLabel(for: segments))
    }
    #endif
}
