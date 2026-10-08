import Foundation
import SwiftUI

/// One failure the reader should hear about, in product copy. Each notice is
/// its own event: a repeat of the same failure carries a new `id`, so the
/// banner shows it again. The copy is fixed per reason — a transport or Server
/// error string never reaches the reader.
public struct HausShellNotice: Identifiable, Equatable, Sendable {
    /// What failed, from the reader's side. Background work — catch-up,
    /// foreground refresh, stream recovery — has no reason here: the offline
    /// indicator already speaks for connectivity, so those failures are logged.
    public enum Reason: CaseIterable, Equatable, Sendable {
        case messageNotSent
        case messagesNotLoaded
        case repliesNotLoaded
        case cloudAgentsNotRefreshed
    }

    public let id: UUID
    public let reason: Reason

    public init(_ reason: Reason, id: UUID = UUID()) {
        self.id = id
        self.reason = reason
    }

    public var message: String {
        switch reason {
        case .messageNotSent: "Message not sent. Check your connection and try again."
        case .messagesNotLoaded: "Messages could not load. Check your connection and try again."
        case .repliesNotLoaded: "Replies could not load. Check your connection and try again."
        case .cloudAgentsNotRefreshed: "Cloud agent status could not refresh. Check your connection and try again."
        }
    }
}

/// A calm, transient notice for a failure the reader should know about — a
/// message that did not send, a refresh that failed. It slides in under the
/// chrome row, is announced to VoiceOver, and leaves on its own or on a tap.
///
/// It reads the App's notice through a closure so this host, not the shell, is
/// what a new notice invalidates. A notice already present when the host mounts
/// is stale and is not shown; only a new one is news.
struct HausShellNoticeHost: View {
    let notice: () -> HausShellNotice?

    @State private var shown: HausShellNotice?

    static let visibleDuration: Duration = .seconds(4)

    var body: some View {
        let current = notice()
        ZStack {
            if let shown {
                HausShellNoticeBanner(message: shown.message) { self.shown = nil }
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.3), value: shown)
        .onChange(of: current) { _, next in
            guard let next else { return }
            shown = next
            AccessibilityNotification.Announcement(next.message).post()
        }
        .task(id: shown?.id) {
            guard shown != nil else { return }
            try? await Task.sleep(for: Self.visibleDuration)
            guard !Task.isCancelled else { return }
            shown = nil
        }
    }
}

struct HausShellNoticeBanner: View {
    let message: String
    let onDismiss: () -> Void

    var body: some View {
        Button(action: onDismiss) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: "exclamationmark.circle.fill")
                    .foregroundStyle(.orange)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(HausPlatformColor.label)
                    .multilineTextAlignment(.leading)
                    .lineLimit(3)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(.regularMaterial, in: .haus(HausRadius.large))
            .overlay(
                RoundedRectangle.haus(HausRadius.large)
                    .strokeBorder(Color.primary.opacity(0.06))
            )
            .shadow(color: .black.opacity(0.08), radius: 12, y: 4)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 24)
        .accessibilityLabel(message)
        .accessibilityHint("Dismisses this notice")
    }
}

#Preview {
    HausShellNoticeBanner(message: HausShellNotice(.messageNotSent).message) {}
        .padding()
}
