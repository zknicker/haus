import SwiftUI

/// A settings row whose value is a switch, in the same geometry as the picker
/// and disclosure rows beside it.
public struct SettingsToggleRow: View {
    private let title: String
    private let subtitle: String?
    private let icon: HausIconName
    private let showsDivider: Bool
    @Binding private var isOn: Bool

    public init(
        _ title: String,
        subtitle: String? = nil,
        icon: HausIconName,
        isOn: Binding<Bool>,
        showsDivider: Bool = true
    ) {
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        _isOn = isOn
        self.showsDivider = showsDivider
    }

    public var body: some View {
        SettingsRow(
            title: title,
            subtitle: subtitle,
            icon: icon,
            showsDivider: showsDivider
        ) {
            Toggle(title, isOn: $isOn)
                .labelsHidden()
        }
        .accessibilityElement(children: .contain)
    }
}
