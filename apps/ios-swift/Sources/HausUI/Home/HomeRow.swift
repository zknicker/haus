import SwiftUI

/// A plain 60pt list row: a lead, a 17pt title over a 15pt muted line, and a
/// trailing time with the unread dot.
struct HomeRow: View {
    let row: HomeRowPresentation
    let now: Date

    @ScaledMetric(relativeTo: .body) private var markSide: CGFloat = 32
    @ScaledMetric(relativeTo: .body) private var discSide: CGFloat = 15

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            lead
            VStack(alignment: .leading, spacing: 3) {
                Text(row.title)
                    .font(.body)
                    .foregroundStyle(HausPlatformColor.ink)
                    .lineLimit(1)
                meta
            }
            Spacer(minLength: 0)
            trailing
        }
        .padding(.vertical, 8)
        .frame(minHeight: 60, alignment: .top)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityValue(row.isUnread ? "Unread" : "")
    }

    @ViewBuilder
    private var lead: some View {
        switch row.lead {
        case .captain(let captain):
            CaptainFaceMark(captain: captain, side: markSide)
        case .person(let name, let avatarURL):
            AvatarView(name: name, url: avatarURL, size: markSide)
        case .project(let appearance):
            ChannelIconBox(appearance: appearance, size: markSide)
        case .task(let state):
            TaskStateDisc(state: state, size: discSide, surface: HausPlatformColor.canvas)
                .frame(width: discSide, height: 22)
        }
    }

    private var meta: some View {
        HStack(spacing: 6) {
            if let captain = row.metaCaptain {
                CaptainFaceMark(captain: captain, side: 16)
            }
            Text(row.meta(now: now))
                .lineLimit(1)
        }
        .font(.subheadline)
        .foregroundStyle(HausPlatformColor.mutedInk)
    }

    private var trailing: some View {
        HStack(spacing: 8) {
            if let time = row.trailingTime(now: now) {
                Text(time)
                    .font(.subheadline)
                    .foregroundStyle(HausPlatformColor.mutedInk)
                    .monospacedDigit()
            }
            if row.isUnread {
                ListUnreadDot()
            }
        }
        .frame(height: 22)
    }
}

/// The 9pt Haus-blue dot that marks something unread. Never a count.
struct ListUnreadDot: View {
    var body: some View {
        Circle()
            .fill(HausPlatformColor.accent)
            .frame(width: 9, height: 9)
            .accessibilityHidden(true)
    }
}

extension View {
    /// A row in a plain Haus list: 20pt margins by default, no separators, on the canvas.
    func hausPlainRow(margin: CGFloat = 20) -> some View {
        listRowInsets(EdgeInsets(top: 0, leading: margin, bottom: 0, trailing: margin))
            .listRowSeparator(.hidden)
            .listRowBackground(HausPlatformColor.canvas)
    }

    /// A section label row: 28pt above, 10pt below.
    func hausSectionLabelRow(isFirst: Bool = false) -> some View {
        padding(.top, isFirst ? 24 : 28)
            .padding(.bottom, 10)
            .hausPlainRow()
    }
}
