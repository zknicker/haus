import SwiftUI

/// The whole row opens an in-place menu; the up/down chevron marks it as a picker.
public struct PickerRow<Value: Hashable>: View {
    private let title: String
    private let value: Value
    private let icon: HausIconName
    private let options: [(Value, String)]
    private let showsDivider: Bool
    private let onChange: (Value) -> Void

    public init(
        _ title: String,
        value: Value,
        icon: HausIconName,
        options: [(Value, String)],
        showsDivider: Bool = true,
        onChange: @escaping (Value) -> Void
    ) {
        self.title = title
        self.value = value
        self.icon = icon
        self.options = options
        self.showsDivider = showsDivider
        self.onChange = onChange
    }

    public var body: some View {
        Menu {
            ForEach(Array(options.enumerated()), id: \.offset) { _, option in
                Button {
                    onChange(option.0)
                } label: {
                    HStack {
                        Text(option.1)
                        if option.0 == value {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            SettingsRow(title: title, value: selectedTitle, icon: icon, showsDivider: false) {
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
        }
        .tint(.primary)
        .accessibilityLabel("\(title), \(selectedTitle)")
        .overlay(alignment: .bottom) {
            if showsDivider {
                Divider()
                    .padding(.leading, 54)
            }
        }
    }

    private var selectedTitle: String {
        options.first(where: { $0.0 == value })?.1 ?? "Select"
    }
}
