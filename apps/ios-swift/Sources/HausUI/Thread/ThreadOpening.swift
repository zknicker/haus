import SwiftUI

/// What a Thread screen says about itself, and how it opens.
enum ThreadOpening {
    /// A claim's Thread is named for the claim; any other Thread is a Thread.
    /// A Thread opened for a claim on one of its replies is a Thread too: the
    /// anchor's claim is not the one the reader asked to see.
    static func title(anchor: MessagePresentation, claimMessageID: String? = nil) -> String {
        guard !opensForReplyClaim(anchor: anchor, claimMessageID: claimMessageID) else { return "Thread" }
        return anchor.claim.map { "Claim #\($0.number)" } ?? "Thread"
    }

    /// Whether the screen opened for a claim on one of its replies rather than
    /// for the Thread itself (`ClaimOpening.containingThread`).
    static func opensForReplyClaim(anchor: MessagePresentation, claimMessageID: String?) -> Bool {
        guard let claimMessageID else { return false }
        return claimMessageID != anchor.id
    }

    /// Whether the screen should stay blank until its first reply page lands.
    /// A Thread the anchor says has replies would otherwise draw the anchor
    /// first and then snap to the newest reply mid-push; one with none has
    /// nothing to wait for.
    static func awaitsFirstReplies(anchor: MessagePresentation) -> Bool {
        (anchor.thread?.replyCount ?? 0) > 0
    }

    /// How long the screen waits for that page before showing what it has.
    static let holdLimit = Duration.milliseconds(1_200)
}

extension View {
    /// The Thread's inline title with its conversation beneath it — the
    /// system subtitle on iOS 26, a two-line principal item before it.
    @ViewBuilder
    func threadNavigationTitle(_ title: String, subtitle: String?) -> some View {
        #if os(iOS)
        if #available(iOS 26, *), let subtitle {
            navigationTitle(title)
                .navigationSubtitle(subtitle)
                .navigationBarTitleDisplayMode(.inline)
        } else {
            navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if let subtitle {
                        ToolbarItem(placement: .principal) {
                            VStack(spacing: 0) {
                                Text(title).font(.headline)
                                Text(subtitle)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .lineLimit(1)
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
        }
        #else
        navigationTitle(title)
        #endif
    }
}
