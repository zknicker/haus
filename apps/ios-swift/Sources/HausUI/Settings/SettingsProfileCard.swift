import SwiftUI

/// You's first card: the viewer's mark and name, the Server as the value, and
/// the chevron into the profile.
struct SettingsProfileRow: View {
    let viewer: SettingsPerson
    let serverName: String
    let action: () -> Void

    @ScaledMetric(relativeTo: .body) private var markSide: CGFloat = 24

    var body: some View {
        Button(action: action) {
            HStack(spacing: SettingsCardMetrics.iconGap) {
                SettingsProfileMark(viewer: viewer, side: markSide)
                    .frame(width: SettingsCardMetrics.iconSide)
                SettingsValueLayout {
                    Text(viewer.displayName)
                        .font(.body)
                        .foregroundStyle(HausPlatformColor.ink)
                } value: {
                    Text(serverName)
                        .font(.body)
                        .foregroundStyle(HausPlatformColor.mutedInk)
                        .settingsRowValueText()
                }
                SettingsChevron()
                    .padding(.leading, SettingsCardMetrics.valueGap - SettingsCardMetrics.iconGap)
            }
            .padding(.vertical, 10)
            .frame(minHeight: SettingsCardMetrics.rowHeight)
            .padding(.leading, SettingsCardMetrics.leadingInset)
            .padding(.trailing, SettingsCardMetrics.trailingInset)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(viewer.displayName), \(serverName)")
        .accessibilityHint("Opens your profile")
    }
}

/// The viewer's photo as a circle, matching the You tab's own photo. Only
/// Captains are rounded squares.
struct SettingsProfileMark: View {
    let viewer: SettingsPerson
    let side: CGFloat

    var body: some View {
        AvatarView(
            name: viewer.displayName,
            url: viewer.avatarURL,
            initials: viewer.initials,
            size: side
        )
        .accessibilityHidden(true)
    }
}
