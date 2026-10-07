import SwiftUI

/// One line of secondary text with a soft band of light sweeping across it,
/// the "still working" treatment. The sweep is a pure function of time, so it
/// never snaps when the line changes; under Reduce Motion the text is still.
struct ChatTypingShimmerText: View {
    static let period: Double = 2.2

    let text: String
    var lineLimit = 1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let base = Text(text)
            .font(.subheadline)
            .lineLimit(lineLimit)
            .truncationMode(.tail)

        base
            .foregroundStyle(.secondary)
            .overlay {
                if !reduceMotion {
                    TimelineView(.animation) { context in
                        GeometryReader { proxy in
                            let phase = Self.phase(at: context.date.timeIntervalSinceReferenceDate)
                            let band = max(proxy.size.width * 0.45, 60)
                            LinearGradient(
                                colors: [.clear, HausPlatformColor.label.opacity(0.85), .clear],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                            .frame(width: band)
                            .offset(x: -band + (proxy.size.width + band) * phase)
                        }
                    }
                    .mask(base)
                    .allowsHitTesting(false)
                }
            }
    }

    /// Where the band is through its sweep, 0 to 1, easing at both ends and
    /// resting briefly off the trailing edge before the next pass.
    static func phase(at seconds: TimeInterval) -> CGFloat {
        let progress = seconds.truncatingRemainder(dividingBy: period) / period
        let sweep = min(1, progress / 0.8)
        return CGFloat(0.5 - cos(sweep * .pi) / 2)
    }
}

/// Three dots that rise and brighten in turn — the App's chat loader, on the
/// phone's frame clock. Still and evenly dimmed under Reduce Motion.
struct ChatTypingDots: View {
    static let period: Double = 1.2

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .subheadline) private var dot: CGFloat = 4.5

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
