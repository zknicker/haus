import SwiftUI

/// The transcript accessory that pages a Thread's older replies in.
///
/// It sits above the oldest loaded reply, so it is the flipped table's
/// accessory rather than a row, and it reports nothing: the screen owns the
/// fetch and tells the button whether one is already running.
struct ThreadLoadOlderAccessory: View {
    let isLoading: Bool
    let onLoad: () async -> Bool

    var body: some View {
        Button {
            Task { @MainActor in _ = await onLoad() }
        } label: {
            Group {
                if isLoading {
                    ProgressView()
                } else {
                    Label("Load older replies", systemImage: "chevron.up")
                }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .disabled(isLoading)
        .padding(.bottom, 8)
    }
}
