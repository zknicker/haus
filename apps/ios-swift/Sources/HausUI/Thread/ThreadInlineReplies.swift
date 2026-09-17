import SwiftUI

/// The parent Chat's inline reply chain shown while inspecting a Task. Closures
/// keep the Store out of HausUI and let the route invalidate this region when a
/// filtered page or its pagination state changes.
public struct ThreadInlineReplies {
    public let id: String
    public let messages: () -> [MessagePresentation]
    public let isLoaded: () -> Bool
    public let isLoading: () -> Bool
    public let hasOlder: () -> Bool
    public let load: () async -> Bool
    public let loadOlder: () async -> Bool

    public init(
        id: String,
        messages: @escaping () -> [MessagePresentation],
        isLoaded: @escaping () -> Bool,
        isLoading: @escaping () -> Bool,
        hasOlder: @escaping () -> Bool,
        load: @escaping () async -> Bool,
        loadOlder: @escaping () async -> Bool
    ) {
        self.id = id
        self.messages = messages
        self.isLoaded = isLoaded
        self.isLoading = isLoading
        self.hasOlder = hasOlder
        self.load = load
        self.loadOlder = loadOlder
    }
}

/// A labeled region inside the Thread transcript. Its rows deliberately omit
/// Ask and cloud-agent actions: the parent chain is an inspection surface, and
/// sending remains the separate dedicated Thread composer below.
struct ThreadInlineRepliesRegion: View {
    let config: ThreadInlineReplies
    let onOpenAttachment: (MessageAttachmentPresentation) async throws -> URL
    @Binding var attachmentPreview: AttachmentPreview?
    let attachmentTiles: AttachmentImageTileRegistry
    let visualHeights: VisualHeightRegistry
    let onOpenAgent: (String) -> Void
    @State private var loadError: String?
    @State private var loadAttempt = 0

    var body: some View {
        let messages = config.messages()
        VStack(alignment: .leading, spacing: 8) {
            ThreadRegionHeader(title: "Inline replies", detail: "Read only")
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
            } else if config.isLoading() && messages.isEmpty {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Loading inline replies…")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else if config.isLoaded() && messages.isEmpty {
                Text("No inline replies yet.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            ForEach(messages) { message in
                ThreadMessageRow(
                    message: message,
                    onOpenAttachment: onOpenAttachment,
                    preview: $attachmentPreview,
                    tiles: attachmentTiles,
                    visualHeights: visualHeights,
                    onOpenAgent: onOpenAgent
                )
                .padding(.top, 4)
            }
        }
        .padding(.top, 12)
        .padding(.bottom, 8)
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

struct ThreadRegionHeader: View {
    let title: String
    var detail: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title)
                .font(.subheadline.weight(.semibold))
            if let detail {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(.secondary)
        .padding(.top, 4)
    }
}

extension ThreadDetailView {
    /// An offered option follows the dedicated Thread send path, so it can
    /// settle the Ask without changing the read-only parent region.
    func answerAsk(_ option: String) async -> Bool {
        guard !pending else { return false }
        return await onSend(option, [])
    }

    @ViewBuilder
    var loadOlderAccessory: some View {
        VStack(spacing: 8) {
            if let inlineReplies, inlineReplies.hasOlder() {
                TranscriptLoadOlderButton(
                    title: "Load older inline replies",
                    isLoading: inlineReplies.isLoading(),
                    onLoad: inlineReplies.loadOlder
                )
            }
            if let onLoadOlderReplies {
                TranscriptLoadOlderButton(
                    title: "Load older replies",
                    isLoading: isLoadingOlderReplies,
                    onLoad: onLoadOlderReplies
                )
            }
        }
    }
}
