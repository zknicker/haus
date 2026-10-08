import SwiftUI

/// A calm, transient notice for a failure the reader should know about — a
/// message that did not send, a refresh that failed. It slides in under the
/// chrome row, is announced to VoiceOver, and leaves on its own or on a tap.
///
/// It reads the App's error through a closure so this host, not the shell, is
/// what a new error invalidates. A value already present when the host mounts
/// is stale and is not shown; only a change is news.
struct HausShellNoticeHost: View {
    let message: () -> String?

    @State private var shown: String?

    static let visibleDuration: Duration = .seconds(4)

    var body: some View {
        let current = message()
        ZStack {
            if let shown {
                HausShellNoticeBanner(message: shown) { self.shown = nil }
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.3), value: shown)
        .onChange(of: current) { _, next in
            guard let next, !next.isEmpty else { return }
            shown = next
            AccessibilityNotification.Announcement(next).post()
        }
        .task(id: shown) {
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
    HausShellNoticeBanner(message: "Message not sent. Check your connection and try again.") {}
        .padding()
}
