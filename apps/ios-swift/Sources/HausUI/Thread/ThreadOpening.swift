import SwiftUI

/// What a Thread screen says about itself, and how it opens.
enum ThreadOpening {
    /// A Task's Thread is named for the Task; any other Thread is a Thread.
    static func title(anchor: MessagePresentation) -> String {
        anchor.task.map { "Task #\($0.number)" } ?? "Thread"
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
