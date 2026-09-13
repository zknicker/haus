import SwiftUI

/// The transcript accessory that pages older history in.
///
/// Both transcripts hold one — the Chat timeline for older Messages, a Thread
/// for older replies — and they differ only in the word for what they page.
/// It sits above the oldest loaded row, so it is the flipped table's accessory
/// rather than a row, and it reports nothing: the screen owns the fetch and
/// tells the button whether one is already running.
struct TranscriptLoadOlderButton: View {
    let title: String
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
                    Label(title, systemImage: "chevron.up")
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
