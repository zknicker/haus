import SwiftUI

/// One Inbox row in the Messages conversation-row grammar, shared by Unread and
/// Happening now so the two sections read as one list: a large leading mark,
/// the title with its perishable fact trailing on the first line (an age, a
/// status), and the context below it in secondary.
///
/// Exactly two lines, each capped at one, so every row in both sections is the
/// same height at a given text size: the list reads as one column, not a stack
/// of differently sized cards. The height is deliberate too: an Unread row's
/// leading swipe reveals the system's icon-only circle, which only reads as
/// Messages' when the row is tall enough to center it with room around it.
///
/// The whole row is the press target and carries no nested control.
struct InboxRowView: View {
    let mark: InboxMark
    let title: String
    let trailing: String?
    let detail: String
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(alignment: .center, spacing: 12) {
                InboxMarkView(mark: mark)

                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(title)
                            .font(.headline)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if let trailing {
                            Text(trailing)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .monospacedDigit()
                                .layoutPriority(1)
                        }
                    }
                    Text(detail)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, InboxMetrics.rowInset)
            .padding(.vertical, InboxMetrics.rowVerticalPadding)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressableRow(cornerRadius: InboxMetrics.boxRadius))
        .accessibilityLabel(title)
        .accessibilityValue([trailing, detail].compactMap { $0 }.joined(separator: ", "))
    }
}

/// One identity grammar for every Inbox row: an Agent's own face, a Channel's
/// icon box, or a Cloud Agent provider glyph boxed the way a Channel is, so
/// every mark in the column has the same footprint.
struct InboxMarkView: View {
    let mark: InboxMark
    var size: CGFloat = InboxMetrics.markSize

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        switch mark {
        case .identity(let name, let avatarURL, let presence):
            AvatarView(name: name, url: avatarURL, presence: presence, size: size)
        case .channel(let appearance):
            ChannelIconBox(appearance: appearance, size: size)
        case .cloudAgent:
            CloudAgentMark(size: size * 0.5, style: .glyph)
                .frame(width: size, height: size)
                .background(
                    ChannelIconBox.mutedFill(colorScheme),
                    in: RoundedRectangle(
                        cornerRadius: ChannelIconBox.cornerRadius(for: size),
                        style: .continuous
                    )
                )
        }
    }
}

/// The Inbox's own metrics inside the List's inset column: each row's mark and
/// the greeting start `rowInset` inside the column's edge.
enum InboxMetrics {
    /// The gap between sections, which the List owns as its section spacing.
    static let sectionSpacing: CGFloat = 22
    static let rowInset: CGFloat = 14
    /// Messages-like breathing room above and below a row's two lines.
    static let rowVerticalPadding: CGFloat = 12
    static let boxRadius: CGFloat = 14
    /// Messages' conversation avatar on a phone. A boxed mark derives its
    /// corner from this size, so the rounded square keeps its shape.
    static let markSize: CGFloat = 44
}
