import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// The landing burst under a stamping sticker: a thin ground ring, 18 soft
/// puffs that spread sideways and rise, and 14 small specks that fly out fast.
/// Positions come from the sticker's seed, so a burst is the same shape every
/// time it plays. A port of the App's `sticker-burst.tsx`.
struct StickerBurst: View {
    let seed: UInt32
    /// Seconds since the sticker landed.
    let elapsed: TimeInterval
    @Environment(\.colorScheme) private var colorScheme

    /// Room around the landing point; puffs and specks never reach its edge.
    static let canvasSize = CGSize(width: 180, height: 120)

    var body: some View {
        let particles = BurstParticle.particles(seed: seed)
        Canvas { context, size in
            let origin = CGPoint(x: size.width / 2, y: size.height / 2)
            drawRing(in: &context, origin: CGPoint(x: origin.x, y: origin.y - 2))
            for particle in particles {
                draw(particle, in: &context, origin: origin)
            }
        }
        .frame(width: Self.canvasSize.width, height: Self.canvasSize.height)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func drawRing(in context: inout GraphicsContext, origin: CGPoint) {
        let p = elapsed / 0.45
        guard p > 0, p < 1 else { return }
        let eased = CubicBezier.easeOut.value(p)
        let scale = StampMotion.lerp(0.5, 2.3, eased)
        let opacity = eased < 0.06 ? eased / 0.06 * 0.7 : 0.7 * (1 - (eased - 0.06) / 0.94)
        let rect = CGRect(x: origin.x - 13 * scale, y: origin.y - 5.5 * scale, width: 26 * scale, height: 11 * scale)
        context.opacity = opacity
        context.stroke(Path(ellipseIn: rect), with: .color(speckColor), lineWidth: 1.5 * scale)
    }

    private func draw(_ particle: BurstParticle, in context: inout GraphicsContext, origin: CGPoint) {
        let isPuff = particle.kind == .puff
        let length = isPuff ? 0.85 : 0.6
        let raw = (elapsed - particle.delay) / length
        guard raw > 0, raw < 1 else { return }
        let p = (isPuff ? CubicBezier.puff : CubicBezier.speck).value(raw)
        let peak = isPuff ? 0.12 : 0.08
        context.opacity = p < peak ? p / peak : 1 - (p - peak) / (1 - peak)
        let scale = isPuff ? StampMotion.lerp(0.2, 1, p) : StampMotion.lerp(1, 0.3, p)
        let rise = isPuff ? 8.0 : 0
        let center = CGPoint(
            x: origin.x + particle.dx * p,
            y: origin.y + (particle.dy - rise) * p
        )
        let side = particle.size * scale
        let rect = CGRect(x: center.x - side / 2, y: center.y - side / 2, width: side, height: side)
        context.fill(Path(ellipseIn: rect), with: .color(isPuff ? puffColor : speckColor))
    }

    private var puffColor: Color {
        colorScheme == .dark
            ? Color(red: 120 / 255, green: 122 / 255, blue: 134 / 255, opacity: 0.45)
            : Color(red: 203 / 255, green: 205 / 255, blue: 214 / 255, opacity: 0.55)
    }

    private var speckColor: Color {
        colorScheme == .dark
            ? Color(red: 170 / 255, green: 172 / 255, blue: 184 / 255, opacity: 0.7)
            : Color(red: 170 / 255, green: 174 / 255, blue: 188 / 255, opacity: 0.8)
    }
}

struct BurstParticle: Equatable, Sendable {
    enum Kind: Sendable { case puff, speck }

    let kind: Kind
    let delay: TimeInterval
    let dx: Double
    let dy: Double
    let size: Double

    /// The burst was tuned around a 26pt sticker; it scales with the 20pt one.
    private static let spread = 20.0 / 26.0

    static func particles(seed: UInt32) -> [BurstParticle] {
        var random = Mulberry32(seed: seed)
        func between(_ min: Double, _ max: Double) -> Double { min + random.next() * (max - min) }
        func integer(_ min: Int, _ max: Int) -> Double { floor(between(Double(min), Double(max + 1))) }
        var particles: [BurstParticle] = []

        for index in 0..<18 {
            let side: Double = index % 2 == 1 ? -1 : 1
            let radius = 22 + random.next() * 48
            let angle = between(-0.55, 0.35)
            particles.append(BurstParticle(
                kind: .puff,
                delay: between(0, 0.08),
                dx: (side * cos(angle) * radius * spread).rounded(),
                dy: (sin(angle) * radius * 0.6 * spread).rounded(),
                size: (integer(9, 24) * spread).rounded()
            ))
        }
        for index in 0..<14 {
            // Most specks fly up and out; the last few skim along the ground.
            let angle = index < 9
                ? between(.pi * 1.05, .pi * 1.95)
                : random.next() < 0.5 ? between(-0.3, 0.2) : between(.pi - 0.2, .pi + 0.3)
            let radius = 50 + random.next() * 45
            particles.append(BurstParticle(
                kind: .speck,
                delay: between(0, 0.05),
                dx: (cos(angle) * radius * spread).rounded(),
                dy: (sin(angle) * radius * 0.8 * spread).rounded(),
                size: max(2, (integer(3, 6) * spread).rounded())
            ))
        }
        return particles
    }
}

/// The App's `mulberry32`, so a sticker's burst matches across clients.
struct Mulberry32 {
    private var state: UInt32

    init(seed: UInt32) { state = seed }

    mutating func next() -> Double {
        state = state &+ 0x6D2B_79F5
        var value = state
        value = (value ^ (value >> 15)) &* (value | 1)
        value ^= value &+ ((value ^ (value >> 7)) &* (value | 61))
        return Double(value ^ (value >> 14)) / 4_294_967_296
    }
}

/// A firm tap on the landing frame.
enum ReactionHaptics {
    @MainActor
    static func land(after delay: TimeInterval) {
        #if canImport(UIKit)
        Task { @MainActor in
            if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
            let generator = UIImpactFeedbackGenerator(style: .rigid)
            generator.impactOccurred(intensity: 0.8)
        }
        #endif
    }
}
