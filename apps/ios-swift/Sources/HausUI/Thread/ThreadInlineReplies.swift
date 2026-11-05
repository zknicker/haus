import SwiftUI

/// The parent Chat's inline replies to a Thread's anchor, which read as part of
/// its conversation. Closures keep the Store out of HausUI and let the route
/// invalidate the rows when a filtered page or its pagination state changes.
public struct ThreadInlineReplies {
    public let id: String
    public let messages: () -> [MessagePresentation]
    public let isLoaded: () -> Bool
    public let isLoading: () -> Bool
    public let hasOlder: () -> Bool
    public let load: () async -> Bool
    public let loadOlder: () async -> Bool
    public let hasNewer: () -> Bool
    public let loadNewer: () async -> Bool

    public init(
        id: String,
        messages: @escaping () -> [MessagePresentation],
        isLoaded: @escaping () -> Bool,
        isLoading: @escaping () -> Bool,
        hasOlder: @escaping () -> Bool,
        load: @escaping () async -> Bool,
        loadOlder: @escaping () async -> Bool,
        hasNewer: @escaping () -> Bool = { false },
        loadNewer: @escaping () async -> Bool = { false }
    ) {
        self.id = id
        self.messages = messages
        self.isLoaded = isLoaded
        self.isLoading = isLoading
        self.hasOlder = hasOlder
        self.load = load
        self.loadOlder = loadOlder
        self.hasNewer = hasNewer
        self.loadNewer = loadNewer
    }
}

/// Loads the parent chain, whose rows sit among the Thread's own. It takes no
/// room until a load fails, when it offers the retry.
struct ThreadInlineRepliesLoader: View {
    let config: ThreadInlineReplies
    @State private var loadError: String?
    @State private var loadAttempt = 0

    var body: some View {
        Group {
            if let loadError {
                HStack(spacing: 8) {
                    Text(loadError)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 4)
                    Button("Retry") {
                        self.loadError = nil
                        loadAttempt += 1
                    }
                    .font(.caption.weight(.semibold))
                }
                .padding(.top, 12)
                .padding(.bottom, 8)
            } else {
                Color.clear.frame(height: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: "\(config.id):\(loadAttempt)") {
            guard !config.isLoaded() else { return }
            let loaded = await config.load()
            guard !Task.isCancelled else { return }
            if !loaded {
                loadError = "Inline replies could not be loaded."
            }
        }
    }
}

extension ThreadDetailView {
    @ViewBuilder
    var loadOlderAccessory: some View {
        VStack(spacing: 8) {
            if let inlineReplies, inlineReplies.hasOlder() {
                TranscriptLoadOlderButton(
                    title: "Load older inline replies",
                    failureTitle: "Couldn’t load earlier replies",
                    isLoading: inlineReplies.isLoading(),
                    onLoad: inlineReplies.loadOlder
                )
            }
            if let inlineReplies, inlineReplies.hasNewer() {
                TranscriptLoadOlderButton(
                    title: "Load newer inline replies",
                    failureTitle: "Couldn’t load newer replies",
                    isLoading: inlineReplies.isLoading(),
                    onLoad: inlineReplies.loadNewer
                )
            }
            if history.hasOlder {
                TranscriptLoadOlderButton(
                    title: "Load older replies",
                    failureTitle: "Couldn’t load earlier replies",
                    isLoading: history.isLoading,
                    onLoad: history.loadOlder
                )
            }
        }
    }
}
