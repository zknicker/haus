import SwiftUI

extension HausRadius {
    /// You's grouped cards.
    static let settingsCard: CGFloat = 26
}

/// You's card geometry from the mocks: 52pt rows, a 20pt glyph 20pt in,
/// titles at 56pt, and separators inset to the titles.
enum SettingsCardMetrics {
    static let rowHeight: CGFloat = 52
    static let leadingInset: CGFloat = 20
    static let trailingInset: CGFloat = 18
    static let iconSide: CGFloat = 20
    static let iconGap: CGFloat = 16
    static let valueGap: CGFloat = 10
    static let separatorTrailing: CGFloat = 16

    static var titleInset: CGFloat { leadingInset + iconSide + iconGap }

    nonisolated static func separatorLeading(hasIcon: Bool) -> CGFloat {
        hasIcon ? titleInset : leadingInset
    }
}

public struct SettingsSection<Content: View>: View {
    private let title: String?
    private let footer: String?
    private let content: () -> Content

    /// - Parameter footer: explanatory copy under the group, the way a grouped
    ///   iOS list carries it; it wraps freely, so rows keep short titles.
    public init(
        _ title: String?,
        footer: String? = nil,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self.footer = footer
        self.content = content
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title {
                SectionCountLabel(title)
                    .padding(.horizontal, SettingsCardMetrics.leadingInset)
            }

            content()

            if let footer {
                Text(footer)
                    .font(.footnote)
                    .foregroundStyle(HausPlatformColor.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, SettingsCardMetrics.leadingInset)
            }
        }
    }
}

public struct SettingsListGroup<Content: View>: View {
    private let content: () -> Content

    public init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    public var body: some View {
        VStack(spacing: 0) {
            content()
        }
        .background(HausPlatformColor.card, in: .haus(HausRadius.settingsCard))
        .clipShape(.haus(HausRadius.settingsCard))
    }
}

/// The rule between card rows, inset to the titles.
struct SettingsSeparator: View {
    var leading: CGFloat = SettingsCardMetrics.titleInset

    var body: some View {
        Rectangle()
            .fill(HausPlatformColor.hairline)
            .frame(height: 1)
            .padding(.leading, leading)
            .padding(.trailing, SettingsCardMetrics.separatorTrailing)
            .accessibilityHidden(true)
    }
}

/// The small trailing chevron of a row that pushes a screen.
struct SettingsChevron: View {
    @ScaledMetric(relativeTo: .body) private var size: CGFloat = 12

    var body: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(HausPlatformColor.faintInk)
            .accessibilityHidden(true)
    }
}

public struct DisclosureRow: View {
    private let title: String
    private let subtitle: String?
    private let value: String?
    private let icon: HausIconName?
    private let showsDivider: Bool
    private let action: () -> Void

    public init(
        _ title: String,
        subtitle: String? = nil,
        value: String? = nil,
        icon: HausIconName?,
        showsDivider: Bool = true,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.subtitle = subtitle
        self.value = value
        self.icon = icon
        self.showsDivider = showsDivider
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            SettingsRow(
                title: title,
                subtitle: subtitle,
                value: value,
                icon: icon,
                showsDivider: false
            ) {
                SettingsChevron()
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel([title, value ?? subtitle].compactMap { $0 }.joined(separator: ", "))
        .overlay(alignment: .bottom) {
            if showsDivider {
                SettingsSeparator(leading: SettingsCardMetrics.separatorLeading(hasIcon: icon != nil))
            }
        }
    }
}

public struct ValueRow: View {
    private let title: String
    private let value: String
    private let icon: HausIconName
    private let showsDivider: Bool

    public init(
        _ title: String,
        value: String,
        icon: HausIconName,
        showsDivider: Bool = true
    ) {
        self.title = title
        self.value = value
        self.icon = icon
        self.showsDivider = showsDivider
    }

    public var body: some View {
        SettingsRow(
            title: title,
            value: value,
            icon: icon,
            showsDivider: showsDivider
        ) {
            EmptyView()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(value)")
    }
}

public struct SettingsAvatar: View {
    private let initials: String
    private let size: CGFloat

    public init(initials: String, size: CGFloat = 40) {
        self.initials = initials
        self.size = size
    }

    public var body: some View {
        Text(initials)
            .font(.system(size: size * 0.35, weight: .medium))
            .foregroundStyle(.tint)
            .frame(width: size, height: size)
            .background(Color(.tertiarySystemFill), in: Circle())
            .accessibilityLabel("Avatar, \(initials)")
    }
}
