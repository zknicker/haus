import SwiftUI

/// Usage behind the Model sheet's header button: each model connection's capacity windows, how
/// much of each is left, and when it resets.
struct ModelUsageView: View {
    let groups: [ModelSheetGroup]

    var body: some View {
        List {
            ForEach(groups) { group in
                Section {
                    if group.capacity.isEmpty {
                        Text("No usage limits reported")
                            .font(HausFont.font(size: 17))
                            .foregroundStyle(HausTone.mutedInk.color)
                    } else {
                        ForEach(group.capacity) { window in
                            ModelUsageWindowRow(window: window)
                        }
                    }
                } header: {
                    HStack(spacing: 8) {
                        ModelProviderMark(provider: group.provider, size: 13, isTinted: true)
                        Text(group.title).foregroundStyle(HausTone.mutedInk.color)
                    }
                    .font(HausFont.font(size: 15))
                    .textCase(nil)
                }
            }
        }
        .modelSheetListStyle()
        .overlay {
            if groups.isEmpty {
                ContentUnavailableView("No Connections", systemImage: "gauge.with.dots.needle.33percent")
            }
        }
        .navigationTitle("Usage")
        .hausInlineNavigationTitle()
    }
}

private struct ModelUsageWindowRow: View {
    let window: ModelCapacityWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(window.label)
                    .font(HausFont.font(size: 17))
                    .foregroundStyle(HausTone.ink.color)
                Spacer(minLength: 8)
                Text("\(window.percentLeft)% left")
                    .font(HausFont.font(size: 15))
                    .monospacedDigit()
                    .foregroundStyle(HausTone.mutedInk.color)
            }
            ProgressView(value: window.fractionLeft)
                .tint(Self.meterTone(percentLeft: window.percentLeft).color)
            if let resetLine = window.resetLine() {
                Text(resetLine)
                    .font(HausFont.font(size: 15))
                    .foregroundStyle(HausTone.faintInk.color)
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }

    /// The web's thresholds: caution from 75% used, critical from 90%.
    nonisolated static func meterTone(percentLeft: Int) -> HausTone {
        if percentLeft <= 10 { return .critical }
        return percentLeft <= 25 ? .caution : .accent
    }
}
