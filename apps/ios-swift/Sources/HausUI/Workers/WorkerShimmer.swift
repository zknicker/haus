import SwiftUI

/// A bright band that sweeps across live text, the Worker's "still working"
/// tell. It holds still under Reduce Motion.
struct WorkerShimmer: ViewModifier {
    let isActive: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if isActive, !reduceMotion {
            content.overlay {
                TimelineView(.animation) { timeline in
                    GeometryReader { geometry in
                        let width = geometry.size.width
                        let phase = Self.phase(at: timeline.date)
                        LinearGradient(
                            colors: [.clear, HausPlatformColor.ink, .clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: max(width * 0.5, 40))
                        .offset(x: (width * 1.6) * phase - width * 0.5)
                    }
                    .mask(content)
                }
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }
        } else {
            content
        }
    }

    nonisolated static func phase(at date: Date, period: TimeInterval = 1.8) -> Double {
        date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period
    }
}

extension View {
    func workerShimmer(_ isActive: Bool) -> some View {
        modifier(WorkerShimmer(isActive: isActive))
    }
}
