import SwiftUI

/// The Haus ghost as vector artwork, tintable or in full app-icon color — the
/// same mark, the same API, and the same numbers as the web component in
/// `apps/website/src/components/haus-ghost.tsx`, which stays the source of
/// truth for the paths, the palette, and the drift.
public struct HausGhost: View {
    /// `solid` paints the body in the current foreground with the eyes punched
    /// out as holes, so whatever sits behind the mark shows through them.
    /// `iridescent` renders it as translucent glass: a hollow interior the
    /// ground reads through, a mesh-colored rim, and a white dome highlight.
    public enum Fill: Sendable {
        case solid
        case iridescent
    }

    private let fill: Fill
    private let animated: Bool
    private let tempo: HausGhostTempo
    private let size: CGFloat

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    /// When the drift stopped, and how much of the clock it has slept through.
    /// Together they hold the mark on the frame it was paused at: the phase is
    /// a pure function of elapsed time, so subtracting the sleep resumes the
    /// loop where it stood instead of snapping it back to the start.
    @State private var pausedAt: Date?
    @State private var slept: TimeInterval = 0

    /// - Parameters:
    ///   - animated: Iridescent only: drift the mesh so the color slowly
    ///     reorganizes.
    ///   - tempo: Animated only: `lively` runs the same drift loops 2.5x faster.
    ///   - size: Rendered height in points; width follows the 192:204 aspect.
    public init(
        fill: Fill = .solid,
        animated: Bool = false,
        tempo: HausGhostTempo = .calm,
        size: CGFloat = 24
    ) {
        self.fill = fill
        self.animated = animated
        self.tempo = tempo
        self.size = size
    }

    public var body: some View {
        Group {
            switch fill {
            case .solid: silhouette
            case .iridescent: glass
            }
        }
        .frame(width: HausGhostPaths.width(forHeight: size), height: size)
        // Decorative everywhere it is drawn: the Inbox row, the sign-in screen,
        // and the opening frame all name themselves.
        .accessibilityHidden(true)
    }

    private var silhouette: some View {
        HausGhostSilhouette().fill(style: FillStyle(eoFill: true))
    }

    /// The canvas only ever redraws on the drift grid: `TimelineView` hands it
    /// one entry per 0.3s tick while the mesh is moving, and exactly one entry
    /// while it is not. Nothing else in the mark animates, so a sidebar showing
    /// one ghost repaints 3.3 times a second at rest and not at all when the
    /// app is backgrounded or Reduce Motion is on.
    private var glass: some View {
        TimelineView(
            HausGhostDriftSchedule(tick: HausGhostDrift.tick(for: tempo), isRunning: isDrifting)
        ) { timeline in
            Canvas { context, _ in
                HausGhostCanvas(
                    height: size,
                    ground: .of(colorScheme),
                    offsets: offsets(at: timeline.date)
                )
                .draw(&context)
            }
        }
        .onAppear {
            if !isDrifting, pausedAt == nil { pausedAt = Date() }
        }
        .onChange(of: isDrifting) { _, running in
            guard running else {
                pausedAt = Date()
                return
            }
            slept += Date().timeIntervalSince(pausedAt ?? Date())
            pausedAt = nil
        }
    }

    /// Nobody is watching a backgrounded app's sidebar, and the filter chain
    /// does not know that.
    private var isDrifting: Bool {
        fill == .iridescent && animated && !reduceMotion && scenePhase == .active
    }

    private func offsets(at date: Date) -> [CGSize] {
        guard fill == .iridescent, animated else {
            return HausGhostDrift.offsets(atPhase: 0, tempo: tempo)
        }
        let moment = pausedAt ?? date
        return HausGhostDrift.offsets(
            atPhase: moment.timeIntervalSinceReferenceDate - slept,
            tempo: tempo
        )
    }
}

/// The body and both eyes as one outline, so an even-odd fill leaves the eyes
/// as holes rather than painting over them.
struct HausGhostSilhouette: Shape {
    func path(in rect: CGRect) -> Path {
        HausGhostPaths.scaled(
            HausGhostPaths.silhouette,
            by: HausGhostPaths.scale(forHeight: rect.height)
        )
    }
}

#Preview {
    VStack(spacing: 28) {
        HStack(alignment: .center, spacing: 24) {
            HausGhost(size: 22)
            HausGhost(fill: .iridescent, animated: true, size: 22)
            HausGhost(fill: .iridescent, animated: true, tempo: .lively, size: 22)
        }
        HausGhost(fill: .iridescent, animated: true, size: 56)
        HausGhost(fill: .iridescent, animated: true, size: 160)
    }
    .padding(40)
}
