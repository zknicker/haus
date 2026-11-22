import SwiftUI

/// A Project as a plain 60pt row: its icon tile, its name over its Captains
/// and open Task count, and when it last moved with the unread dot.
struct ProjectRow: View {
    let row: ProjectRowPresentation
    let now: Date

    @ScaledMetric(relativeTo: .body) private var tileSide: CGFloat = 32
    @ScaledMetric(relativeTo: .subheadline) private var markSide: CGFloat = 16

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            lead
            VStack(alignment: .leading, spacing: 3) {
                Text(row.name)
                    .font(.body)
                    .foregroundStyle(HausPlatformColor.ink)
                    .lineLimit(1)
                meta
            }
            Spacer(minLength: 0)
            ProjectListTrailing(time: row.lastActivityAt, now: now, isUnread: row.isUnread)
        }
        .padding(.vertical, 8)
        .frame(minHeight: 60, alignment: .top)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityValue(row.isUnread ? "Unread" : "")
    }

    @ViewBuilder
    private var lead: some View {
        if row.isAll {
            Image(systemName: "person.2")
                .font(.subheadline)
                .foregroundStyle(HausPlatformColor.mutedInk)
                .frame(width: tileSide, height: tileSide)
                .background(HausPlatformColor.fill, in: .haus(HausRadius.mark(side: tileSide)))
                .accessibilityHidden(true)
        } else {
            ChannelIconBox(appearance: row.appearance, size: tileSide)
        }
    }

    @ViewBuilder
    private var meta: some View {
        let marks = row.isAll ? [] : Array(row.captains.prefix(4))
        if !marks.isEmpty || row.meta != nil {
            HStack(spacing: 6) {
                if !marks.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(marks) { CaptainFaceMark(captain: $0, side: markSide) }
                    }
                }
                if let meta = row.meta {
                    Text(meta).lineLimit(1)
                }
            }
            .font(.subheadline)
            .foregroundStyle(HausPlatformColor.mutedInk)
        }
    }
}

/// A person's DM in the People section.
struct PersonRow: View {
    let row: PersonRowPresentation

    @ScaledMetric(relativeTo: .body) private var avatarSide: CGFloat = 32

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            AvatarView(name: row.name, url: row.avatarURL, size: avatarSide)
            Text(row.name)
                .font(.body)
                .foregroundStyle(HausPlatformColor.ink)
                .lineLimit(1)
            Spacer(minLength: 0)
            Text("DM")
                .font(.subheadline)
                .foregroundStyle(HausPlatformColor.mutedInk)
            if row.isUnread {
                ListUnreadDot()
            }
        }
        .frame(minHeight: 52)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityValue(row.isUnread ? "Unread" : "")
    }
}

/// The Archived row: a folder tile, the count, and a chevron.
struct ArchivedProjectsRow: View {
    let count: Int?

    @ScaledMetric(relativeTo: .body) private var tileSide: CGFloat = 32

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "folder")
                .font(.subheadline)
                .foregroundStyle(HausPlatformColor.mutedInk)
                .frame(width: tileSide, height: tileSide)
                .background(HausPlatformColor.fill, in: .haus(HausRadius.mark(side: tileSide)))
                .accessibilityHidden(true)
            Text("Archived")
                .font(.body)
                .foregroundStyle(HausPlatformColor.ink)
            Spacer(minLength: 0)
            if let count {
                Text(count, format: .number)
                    .font(.subheadline)
                    .foregroundStyle(HausPlatformColor.mutedInk)
                    .monospacedDigit()
            }
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(HausPlatformColor.faintInk)
                .accessibilityHidden(true)
        }
        .frame(minHeight: 52)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}

/// A list row's trailing time and unread dot.
struct ProjectListTrailing: View {
    let time: Date?
    let now: Date
    let isUnread: Bool

    var body: some View {
        HStack(spacing: 8) {
            if let time {
                Text(HausCompactRelativeTime.label(for: time, now: now))
                    .font(.subheadline)
                    .foregroundStyle(HausPlatformColor.mutedInk)
                    .monospacedDigit()
            }
            if isUnread {
                ListUnreadDot()
            }
        }
        .frame(height: 22)
    }
}
