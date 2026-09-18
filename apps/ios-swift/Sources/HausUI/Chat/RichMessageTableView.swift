import SwiftUI

/// A GFM table, drawn natively.
///
/// A transcript is a scrolling list, so a table is a `Grid` rather than a web
/// view: one more `WKWebView` per table would be one more content process per
/// row. The look is the App's own table — hairline rules between rows, a
/// lighter column label with no fill behind it, and figures that line up
/// because the cells set tabular digits.
struct RichMessageTableView: View {
    let table: RichMessageTable
    let textStyle: Font.TextStyle

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Grid(alignment: .topLeading, horizontalSpacing: 0, verticalSpacing: 0) {
                GridRow {
                    ForEach(Array(table.header.enumerated()), id: \.offset) { column, cell in
                        RichMessageTableCell(
                            segments: cell,
                            textStyle: textStyle,
                            alignment: alignment(column),
                            isHeader: true
                        )
                        .gridColumnAlignment(gridAlignment(column))
                    }
                }
                ForEach(Array(table.rows.enumerated()), id: \.offset) { _, row in
                    Divider().gridCellUnsizedAxes(.horizontal)
                    GridRow {
                        ForEach(Array(row.enumerated()), id: \.offset) { column, cell in
                            RichMessageTableCell(
                                segments: cell,
                                textStyle: textStyle,
                                alignment: alignment(column),
                                isHeader: false,
                                columnLabel: headerLabel(column)
                            )
                        }
                    }
                }
            }
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func alignment(_ column: Int) -> RichMessageTableAlignment {
        column < table.alignments.count ? table.alignments[column] : .leading
    }

    private func gridAlignment(_ column: Int) -> HorizontalAlignment {
        switch alignment(column) {
        case .leading: .leading
        case .center: .center
        case .trailing: .trailing
        }
    }

    /// What VoiceOver names a cell's column, so a row read aloud still says
    /// which figure is which.
    private func headerLabel(_ column: Int) -> String {
        guard column < table.header.count else { return "" }
        return RichMessageInlineText.plainText(table.header[column])
    }
}

/// One cell: the inline run it carries, on the App's cell metrics.
private struct RichMessageTableCell: View {
    let segments: [RichMessageSegment]
    let textStyle: Font.TextStyle
    let alignment: RichMessageTableAlignment
    let isHeader: Bool
    var columnLabel: String?

    var body: some View {
        Text(RichMessageInlineText.attributed(segments, textStyle: textStyle))
            .fontWeight(isHeader ? .medium : nil)
            .foregroundStyle(isHeader ? AnyShapeStyle(.secondary) : AnyShapeStyle(.primary))
            .monospacedDigit()
            .multilineTextAlignment(textAlignment)
            .textSelection(.enabled)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .accessibilityLabel(accessibilityLabel)
    }

    private var textAlignment: TextAlignment {
        switch alignment {
        case .leading: .leading
        case .center: .center
        case .trailing: .trailing
        }
    }

    private var accessibilityLabel: String {
        let words = RichMessageInlineText.plainText(segments)
        guard let columnLabel, !columnLabel.isEmpty else { return words }
        return "\(columnLabel), \(words)"
    }
}
