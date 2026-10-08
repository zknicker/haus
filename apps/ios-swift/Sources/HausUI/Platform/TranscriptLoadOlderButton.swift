import SwiftUI

/// The transcript accessory that pages older history in.
///
/// Both transcripts hold one — the Chat timeline for older Messages, a Thread
/// for older replies — and they differ only in the word for what they page.
/// It sits above the oldest loaded row, so it is the flipped table's accessory
/// rather than a row. The screen owns the fetch and tells the button whether
/// one is already running; a fetch the reader asked for that fails says so
/// right here, in a quiet line with Try Again, rather than in a banner.
struct TranscriptLoadOlderButton: View {
    let title: String
    var failureTitle = "Couldn’t load earlier messages"
    let isLoading: Bool
    let onLoad: () async -> Bool

    @State private var didFail = false

    var body: some View {
        Group {
            if didFail, !isLoading {
                HStack(spacing: 6) {
                    Text(failureTitle)
                        .foregroundStyle(.secondary)
                    Text("·").foregroundStyle(.tertiary)
                    Button("Try Again", action: load)
                        .buttonStyle(.borderless)
                }
                .font(.footnote)
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .combine)
                .accessibilityAction(named: "Try Again", load)
            } else {
                Button(action: load) {
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
            }
        }
        .padding(.bottom, 8)
    }

    private func load() {
        Task { @MainActor in
            let loaded = await onLoad()
            didFail = !loaded && !Task.isCancelled
        }
    }
}
