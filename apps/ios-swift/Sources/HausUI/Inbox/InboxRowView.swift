import SwiftUI

/// One Inbox row in the Messages conversation-row grammar, shared by Unread and
/// Happening now so the two sections read as one list: a large leading mark,
/// the title with its perishable fact trailing on the first line (an age, a
/// status), and the context below it in secondary.
///
/// Exactly two lines, each capped at one, so every row in both sections is the
/// same height at a given text size: the list reads as one column, not a stack
/// of differently sized cards. Accessibility sizes are the exception: there the
/// title wraps and the trailing fact stacks under it, because one line of
/// headline at that size holds only a few letters. The height is deliberate too: an Unread row's
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

    @ScaledMetric(relativeTo: .headline) private var markSize = InboxMetrics.markSize
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Button(action: onOpen) {
            HStack(alignment: isStacked ? .top : .center, spacing: InboxMetrics.markSpacing) {
                InboxMarkView(mark: mark, size: resolvedMarkSize)

                VStack(alignment: .leading, spacing: 2) {
                    if isStacked {
                        // At accessibility sizes the title gets the whole
                        // line and may wrap; the perishable fact moves under
                        // it instead of squeezing it down to a letter.
                        titleText.lineLimit(2)
                        if let trailing { trailingText(trailing) }
                    } else {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            titleText
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if let trailing {
                                trailingText(trailing).fixedSize()
                            }
                        }
                    }
                    Text(detail)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(isStacked ? 3 : 1)
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
        // Every row's separator starts under its title, whatever the mark drew
        // — an initials avatar, an image, a channel box — instead of the List
        // guessing from the first text it finds.
        .alignmentGuide(.listRowSeparatorLeading) { [separatorLeading] _ in separatorLeading }
        .accessibilityLabel(title)
        .accessibilityValue([trailing, detail].compactMap { $0 }.joined(separator: ", "))
    }

    private var isStacked: Bool { dynamicTypeSize.isAccessibilitySize }

    /// The mark grows with text size so it keeps pace with two taller lines,
    /// up to a cap past which it would only eat the title's width.
    private var resolvedMarkSize: CGFloat { min(markSize, InboxMetrics.maxMarkSize) }

    private var separatorLeading: CGFloat {
        InboxMetrics.rowInset + resolvedMarkSize + InboxMetrics.markSpacing
    }

    private var titleText: some View {
        Text(title)
            .font(.headline)
            .truncationMode(.tail)
    }

    private func trailingText(_ value: String) -> some View {
        Text(value)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .monospacedDigit()
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
        case .cloudAgent(let isRunning):
            CloudAgentMark(size: size * 0.5, style: .glyph)
                .frame(width: size, height: size)
                .background(
                    ChannelIconBox.mutedFill(colorScheme),
                    in: RoundedRectangle(
                        cornerRadius: ChannelIconBox.cornerRadius(for: size),
                        style: .continuous
                    )
                )
                .overlay(alignment: .bottomTrailing) { statusDot(isRunning: isRunning) }
        }
    }

    /// Drawn at the avatar presence dot's size and offset, so the column's
    /// status marks all sit in one place.
    private func statusDot(isRunning: Bool) -> some View {
        let diameter = min(size * 0.33, 16)
        return Circle()
            .fill(isRunning ? Color.yellow : Color.gray)
            .frame(width: diameter, height: diameter)
            .overlay { Circle().stroke(.background, lineWidth: diameter > 12 ? 3 : 2) }
            .offset(x: 2, y: 2)
            .accessibilityHidden(true)
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
    static let boxRadius: CGFloat = HausRadius.medium
    /// Messages' conversation avatar on a phone. A boxed mark derives its
    /// corner from this size, so the rounded square keeps its shape.
    static let markSize: CGFloat = 44
    static let maxMarkSize: CGFloat = 64
    static let markSpacing: CGFloat = 12
}
