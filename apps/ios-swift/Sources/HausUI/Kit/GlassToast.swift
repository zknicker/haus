import SwiftUI

/// A short confirmation, such as "Branch copied", shown as a ``GlassToast``.
struct HausToast: Equatable, Identifiable, Sendable {
    let id: UUID
    let text: String
    let systemImage: String

    init(_ text: String, systemImage: String, id: UUID = UUID()) {
        self.id = id
        self.text = text
        self.systemImage = systemImage
    }
}

/// A 38pt glass capsule with an icon and short text.
struct GlassToast: View {
    let toast: HausToast

    @ScaledMetric(relativeTo: .subheadline) private var height: CGFloat = 38

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: toast.systemImage)
            Text(toast.text)
                .lineLimit(1)
        }
        .hausFont(.toast)
        .foregroundStyle(HausPlatformColor.ink)
        .padding(.horizontal, 14)
        .frame(height: height)
        .glassEffect(.regular, in: .capsule)
        .accessibilityElement(children: .combine)
    }
}

extension View {
    /// Presents `toast` under the top edge. The caller owns dismissal by
    /// setting it back to nil; a new toast replaces the one showing.
    func glassToast(_ toast: HausToast?) -> some View {
        modifier(GlassToastPresenter(toast: toast))
    }
}

private struct GlassToastPresenter: ViewModifier {
    let toast: HausToast?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            ZStack {
                if let toast {
                    GlassToast(toast: toast)
                        .id(toast.id)
                        .transition(transition)
                        .onAppear {
                            AccessibilityNotification.Announcement(toast.text).post()
                        }
                }
            }
            .padding(.top, 2)
            .animation(.spring(duration: 0.35, bounce: 0.2), value: toast)
        }
    }

    private var transition: AnyTransition {
        reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity)
    }
}
