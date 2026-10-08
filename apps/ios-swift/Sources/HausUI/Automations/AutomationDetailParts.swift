import SwiftUI

/// A detail screen's header: the automation's name, then which kind it is.
struct AutomationDetailHeader: View {
    let title: String
    let kindLabel: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.title2.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
            Text(kindLabel)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .accessibilityElement(children: .combine)
    }
}

/// One fact: a short title and its one-line value, stacking under the title
/// when both do not fit (the settings-row contract).
struct AutomationFactRow: View {
    let title: String
    let value: String
    var showsDivider = true

    var body: some View {
        SettingsRow(title: title, value: value, showsDivider: showsDivider) { EmptyView() }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(title), \(value)")
    }
}

/// The Chat an automation was set in. It opens that Chat when the phone can,
/// and otherwise only names it.
struct AutomationChatRow: View {
    let label: String?
    let open: () -> Void

    var body: some View {
        if let label {
            Button(action: open) {
                SettingsRow(title: "Set in", value: label) {
                    // Not a chevron: this leaves Settings for the Chat.
                    Image(systemName: "arrow.up.forward")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.tertiary)
                        .accessibilityHidden(true)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Set in \(label)")
            .accessibilityHint("Opens the chat")
        } else {
            AutomationFactRow(title: "Set in", value: "Another chat")
        }
    }
}

/// Full text the row could only name — a Reminder's instructions, a Trigger's
/// instruction. The one place it reads in full, so it wraps.
struct AutomationTextSection: View {
    let title: String
    let text: String

    var body: some View {
        SettingsSection(title) {
            SettingsListGroup {
                Text(text)
                    .font(.body)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
            }
        }
    }
}

/// A retained history: newest first, capped so a 15-minute cadence does not
/// grow the screen without end. Blank until the read settles.
struct AutomationHistorySection<Entry: Identifiable>: View {
    let title: String
    let entries: [Entry]?
    let failed: Bool
    let emptyText: String
    let row: (Entry) -> (title: String, value: String?)

    static var limit: Int { 20 }

    var body: some View {
        let shown = entries.map { Array($0.prefix(Self.limit)) }
        SettingsSection(
            title,
            footer: (entries?.count ?? 0) > Self.limit ? "Showing the latest \(Self.limit)." : nil
        ) {
            if let shown {
                SettingsListGroup {
                    if shown.isEmpty { AutomationNote(emptyText) }
                    ForEach(shown) { entry in
                        let content = row(entry)
                        SettingsRow(
                            title: content.title,
                            value: content.value,
                            showsDivider: entry.id != shown.last?.id
                        ) { EmptyView() }
                            .monospacedDigit()
                            .accessibilityElement(children: .combine)
                    }
                }
            } else if failed {
                SettingsListGroup { AutomationNote("Unable to load \(title.lowercased()).") }
            }
        }
    }
}
