import SwiftUI

/// One Automation as a list row — the App's `AutomationRow`: its kind as a
/// tinted mark, its name, and one short line saying when or how it runs.
/// Everything else lives on the detail screen the row opens, so a row never
/// wraps. `badge` is for the exceptional state only.
struct AutomationRow: View {
    let kind: MessageCausePresentation.Kind
    let systemImage: String
    let title: String
    let summary: String
    var badge: String?
    var showsDivider = true
    let action: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @ScaledMetric(relativeTo: .body) private var markSize: CGFloat = 32

    var body: some View {
        let ink = AutomationMarkInk.tint(kind, colorScheme)
        Button(action: action) {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Image(systemName: systemImage)
                        .font(.system(size: markSize * 0.47, weight: .semibold))
                        .foregroundStyle(ink)
                        .frame(width: markSize, height: markSize)
                        .background(ink.opacity(0.18), in: .haus(HausRadius.mark(side: markSize)))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title)
                            .font(.body)
                            .foregroundStyle(.primary)
                        Text(summary)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if let badge {
                        Text(badge)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.secondary.opacity(0.14), in: Capsule())
                            .fixedSize()
                    }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.tertiary)
                        .accessibilityHidden(true)
                }
                .padding(.vertical, 10)
                .padding(.horizontal, 16)
                .frame(minHeight: 60)
                .contentShape(Rectangle())

                if showsDivider {
                    Divider().padding(.leading, 16 + markSize + 12)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel([title, summary, badge].compactMap { $0 }.joined(separator: ", "))
        .accessibilityAddTraits(.isButton)
    }
}
