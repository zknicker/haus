import SwiftUI

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
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 16)
            }

            content()

            if let footer {
                Text(footer)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 16)
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
        .background(HausPlatformColor.groupedSurface, in: .haus(HausRadius.grouped))
        .clipShape(.haus(HausRadius.grouped))
    }
}

public struct DisclosureRow: View {
    private let title: String
    private let subtitle: String?
    private let value: String?
    private let icon: HausIconName
    private let showsDivider: Bool
    private let action: () -> Void

    public init(
        _ title: String,
        subtitle: String? = nil,
        value: String? = nil,
        icon: HausIconName,
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
                Image(systemName: "chevron.right")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel([title, value ?? subtitle].compactMap { $0 }.joined(separator: ", "))
        .overlay(alignment: .bottom) {
            if showsDivider {
                Divider()
                    .padding(.leading, 54)
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
