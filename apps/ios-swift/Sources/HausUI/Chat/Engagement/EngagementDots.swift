import SwiftUI

/// Three dots that rise and brighten in turn — the App's chat loader, on the
/// phone's frame clock. Still and evenly dimmed under Reduce Motion.
struct EngagementDots: View {
    static let period: Double = 1.2

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .caption) private var dot: CGFloat = 4

    var body: some View {
        if reduceMotion {
            dots(at: nil)
        } else {
            TimelineView(.animation) { context in
                dots(at: context.date.timeIntervalSinceReferenceDate)
            }
        }
    }

    private func dots(at seconds: TimeInterval?) -> some View {
        HStack(spacing: dot * 0.7) {
            ForEach(0..<3, id: \.self) { index in
                let lift = seconds.map { Self.lift(index: index, at: $0) } ?? 0
                Circle()
                    .fill(.secondary)
                    .frame(width: dot, height: dot)
                    .opacity(0.45 + 0.55 * lift)
                    .offset(y: -dot * 0.5 * lift)
            }
        }
        .frame(height: dot * 2)
        .accessibilityHidden(true)
    }

    /// 0 at rest, 1 at the top of a dot's hop; each dot trails the last by a
    /// sixth of the period, and every dot rests for half of it.
    static func lift(index: Int, at seconds: TimeInterval) -> Double {
        let offset = Double(index) / 6
        let progress = (seconds / period + 1 - offset).truncatingRemainder(dividingBy: 1)
        guard progress < 0.5 else { return 0 }
        return sin(progress / 0.5 * .pi)
    }
}
