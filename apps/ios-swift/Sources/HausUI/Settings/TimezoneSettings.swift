import HausModels
import SwiftUI

/// The viewer's timezone on their Profile. Haus fills it from the device the
/// first time the phone signs in; after that it changes only here, and Haus
/// never prompts when the device zone differs.
struct TimezoneSection: View {
    let timezone: String?
    let onOpen: () -> Void

    var body: some View {
        SettingsSection(
            nil,
            footer: "Agents schedule your daily and weekly reminders in this zone. Haus sets it from your device."
        ) {
            SettingsListGroup {
                DisclosureRow(
                    "Timezone",
                    value: timezone.map(HumanTimezone.label) ?? "Not set",
                    icon: .website,
                    showsDivider: false,
                    action: onOpen
                )
            }
        }
    }
}

/// Every zone the phone knows, searchable by place name. Picking one saves and
/// returns to the Profile.
struct TimezonePickerView: View {
    let selection: String?
    let select: (String) -> Void
    @State private var query = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let zones = HumanTimezone.options(current: selection).filter {
            HumanTimezone.matches($0, query: query)
        }
        ScrollViewReader { proxy in
            List(zones, id: \.self) { zone in
                Button {
                    select(zone)
                    dismiss()
                } label: {
                    HStack {
                        // Names wrap at words; they never truncate.
                        Text(HumanTimezone.label(zone))
                            .foregroundStyle(Color.primary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 8)
                        if zone == selection {
                            Image(systemName: "checkmark").fontWeight(.semibold).foregroundStyle(.tint)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .accessibilityAddTraits(zone == selection ? .isSelected : [])
            }
            // Opens on the current zone rather than on Africa/Abidjan.
            .onAppear { if let selection { proxy.scrollTo(selection, anchor: .center) } }
        }
        .overlay {
            if zones.isEmpty { ContentUnavailableView.search(text: query) }
        }
        .timezoneSearchable(text: $query)
        .navigationTitle("Timezone")
        .hausInlineNavigationTitle()
    }
}

private extension View {
    /// Always-visible search: hundreds of zones are a list people search, not scroll.
    func timezoneSearchable(text: Binding<String>) -> some View {
        #if os(iOS)
        searchable(text: text, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search timezones")
        #else
        searchable(text: text, prompt: "Search timezones")
        #endif
    }
}

#Preview("Timezone picker") {
    NavigationStack {
        TimezonePickerView(selection: "America/New_York") { _ in }
    }
}
