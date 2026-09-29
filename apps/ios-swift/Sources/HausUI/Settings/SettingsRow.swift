import SwiftUI

/// Where a row's trailing content goes.
public enum SettingsRowContentLayout: Sendable {
    /// Always trailing: switches, chevrons, empty rows.
    case trailing
    /// An editable field that takes every point the title leaves over, moving
    /// under the title at accessibility sizes. The field never flips layouts
    /// while it is typed into.
    case stacksAtAccessibilitySizes
}

/// One grouped-list row. Titles never truncate and the row grows with Dynamic
/// Type, like iOS Settings. A `value` is one line always: trailing beside the
/// title when both fit, otherwise under it, truncated in the middle only if it
/// still does not fit. Long-form values preview as a one-line `subtitle`.
public struct SettingsRow<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private let title: String
    private let subtitle: String?
    private let value: String?
    private let icon: HausIconName?
    private let showsDivider: Bool
    private let layout: SettingsRowContentLayout
    private let content: () -> Content

    public init(
        title: String,
        subtitle: String? = nil,
        value: String? = nil,
        icon: HausIconName? = nil,
        showsDivider: Bool = true,
        layout: SettingsRowContentLayout = .trailing,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self.subtitle = subtitle
        self.value = value
        self.icon = icon
        self.showsDivider = showsDivider
        self.layout = layout
        self.content = content
    }

    public var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                if let icon {
                    HausIcon(icon, size: 21, weight: 1.8)
                        .frame(width: 24)
                        .foregroundStyle(.primary)
                }
                if let value {
                    SettingsValueLayout { labels } value: {
                        Text(value)
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .settingsRowValueText()
                    }
                    content()
                } else if layout == .stacksAtAccessibilitySizes {
                    if dynamicTypeSize.isAccessibilitySize {
                        VStack(alignment: .leading, spacing: 2) {
                            labels
                            content().environment(\.settingsRowValueStacked, true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        labels.fixedSize(horizontal: true, vertical: false)
                        content().frame(maxWidth: .infinity, alignment: .trailing)
                    }
                } else {
                    labels.frame(maxWidth: .infinity, alignment: .leading)
                    content()
                }
            }
            .padding(.vertical, 10)
            .frame(minHeight: 52)
            .padding(.horizontal, 16)
            .contentShape(Rectangle())

            if showsDivider {
                Divider()
                    .padding(.leading, icon == nil ? 16 : 54)
            }
        }
    }

    private var labels: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.body)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
            if let subtitle {
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }
}

/// A leading label beside a one-line value when both fit, else the value on
/// its own line under the label. The value is never wrapped or hyphenated:
/// style it with `settingsRowValueText()` so a value too long even for its own
/// line truncates in the middle.
struct SettingsValueLayout<Leading: View, Value: View>: View {
    private let leading: Leading
    private let value: Value

    init(@ViewBuilder leading: () -> Leading, @ViewBuilder value: () -> Value) {
        self.leading = leading()
        self.value = value()
    }

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                leading.fixedSize()
                Spacer(minLength: 8)
                value.fixedSize()
            }
            VStack(alignment: .leading, spacing: 2) {
                leading
                value.environment(\.settingsRowValueStacked, true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

extension EnvironmentValues {
    /// True where a row has moved its value under the title.
    @Entry var settingsRowValueStacked = false
}

extension View {
    /// Trailing beside a row title; leading once the row moves the value under it.
    public func settingsRowValueAlignment() -> some View {
        modifier(SettingsRowValueAlignment())
    }

    /// A read-only row value: one line, truncated in the middle, never wrapped.
    public func settingsRowValueText() -> some View {
        lineLimit(1)
            .truncationMode(.middle)
            .settingsRowValueAlignment()
    }
}

private struct SettingsRowValueAlignment: ViewModifier {
    @Environment(\.settingsRowValueStacked) private var stacked

    func body(content: Content) -> some View {
        content.multilineTextAlignment(stacked ? .leading : .trailing)
    }
}
