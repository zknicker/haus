import SwiftUI

extension HausTextRole {
    static let workRowTitle = HausTextRole(size: 17, weight: .regular, textStyle: .body)
    static let workRowMeta = HausTextRole(size: 15, weight: .regular, textStyle: .subheadline)
}

/// The Work view's plain list row: a 28pt leading glyph column, a 17pt title,
/// and a 15pt muted meta line, at least 60pt tall. Pull request, file, and
/// Worker rows all draw through it so the list keeps one rhythm.
struct WorkListRow<Lead: View, Meta: View>: View {
    private let title: String
    @ViewBuilder private let lead: () -> Lead
    @ViewBuilder private let meta: () -> Meta

    @ScaledMetric(relativeTo: .body) private var minHeight: CGFloat = 60
    @ScaledMetric(relativeTo: .body) private var titleLineHeight: CGFloat = 22

    init(
        title: String,
        @ViewBuilder lead: @escaping () -> Lead,
        @ViewBuilder meta: @escaping () -> Meta
    ) {
        self.title = title
        self.lead = lead
        self.meta = meta
    }

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            lead()
                .frame(width: 28, height: titleLineHeight, alignment: .leading)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .hausFont(.workRowTitle)
                    .foregroundStyle(HausPlatformColor.ink)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    meta()
                }
                .hausFont(.workRowMeta)
                .foregroundStyle(HausPlatformColor.mutedInk)
                .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
        .frame(minHeight: minHeight, alignment: .top)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}

/// A list section in the Work view: its count label, then its rows.
struct WorkListSection<Content: View>: View {
    private let title: String
    private let count: Int?
    @ViewBuilder private let content: () -> Content

    init(_ title: String, count: Int?, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.count = count
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionCountLabel(title, count: count)
                .padding(.top, 28)
                .padding(.bottom, 10)
            content()
        }
    }
}

/// A row's meta line as dot-separated text pieces.
struct WorkMetaLine: View {
    let pieces: [String]

    var body: some View {
        Text(pieces.joined(separator: " · "))
    }
}
