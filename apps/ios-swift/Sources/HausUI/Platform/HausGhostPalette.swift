import SwiftUI

/// Every color the glass stack paints with, and the stop tables that place
/// those colors along a run: the interior scatter's falloff, the colored rim,
/// the outline, and the two fade masks.
///
/// Ported value for value from `apps/website/src/components/haus-ghost-palette.ts`
/// and the layer opacities in `haus-ghost.css`, which stay the source of truth.
/// The web writes plain sRGB hex, so these are sRGB — the mark keeps its own
/// colors on every ground, and nothing here is a theme token.
public enum HausGhostPalette {
    /// Every white in the stack — scatter, rim light, specular.
    static let highlight = Color.white
    /// The upper-left outline. The mesh has no color up there, so the edge
    /// samples the highlight's own cool cast instead of falling back to ink.
    static let edgeCool = srgb(0x8D_92C5)
    static let azure = srgb(0x00_BAFF)
    static let violet = srgb(0xA5_51FF)
    static let rose = srgb(0xFF_43A6)
    static let roseLight = srgb(0xFF_78BD)
    /// The three drifting blobs: deeper than the rim, since they are what the
    /// rim and the halo are sampling.
    static let meshAzure = srgb(0x00_ADFF)
    static let meshViolet = srgb(0x95_39FF)
    static let meshRose = srgb(0xFF_43A6)
    static let eye = srgb(0x1F_1D24)

    /// The stable colored rim under the drifting mesh, upper-right to
    /// lower-left: rose owns the right lobe through the bottom and only softens
    /// to `roseLight` by the bottom-left, while violet is a short transition
    /// rather than a region of its own.
    static let rimColorStops = Gradient(stops: [
        .init(color: azure, location: 0),
        .init(color: violet, location: 0.32),
        .init(color: rose, location: 0.58),
        .init(color: rose, location: 0.86),
        .init(color: roseLight, location: 1),
    ])

    /// The outline runs upper-left to lower-right, walking the same colors the
    /// mesh does. `edgeStrength` carries the weight, so these are relative.
    static let edgeStops = Gradient(stops: [
        .init(color: edgeCool.opacity(0.9), location: 0),
        .init(color: azure, location: 0.38),
        .init(color: violet, location: 0.68),
        .init(color: rose, location: 1),
    ])

    /// Never reaches black: the upper left keeps a trace of color so the mesh
    /// fades out rather than stopping at a line.
    static let sideFade = fade([(0, 0x26), (0.3, 0x4D), (0.65, 0xD0), (1, 0xFF)])

    /// Keeps a floor rather than reaching black: the white line still traces
    /// the far edge, faintly, so the silhouette closes.
    static let domeFade = fade([(0, 0xFF), (0.34, 0xDE), (0.72, 0x4A), (1, 0x36)])

    /// Grey floor, not black: the mesh still tints the deep interior, it just
    /// stops flooding it.
    static let rimMaskFloor: Double = 0x3E / 255

    /// Two specular spots, at different angles, are what stop the dome from
    /// reading as an evenly lit ball.
    static let speculars: [Specular] = [
        Specular(x: 62, y: 40, radiusX: 24, radiusY: 7.5, degrees: -40, weight: 1),
        Specular(x: 44, y: 74, radiusX: 11, radiusY: 5, degrees: -66, weight: 0.6),
    ]

    static let specularStrength: Double = 0.7
    static let edgeStrength: Double = 0.5

    struct Specular: Sendable {
        let x: CGFloat
        let y: CGFloat
        let radiusX: CGFloat
        let radiusY: CGFloat
        let degrees: CGFloat
        let weight: Double
    }

    private static func srgb(_ hex: Int) -> Color {
        Color(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }

    /// A luminance mask becomes an alpha mask on the way to `Canvas`: SwiftUI
    /// composites with `destinationIn` rather than reading a layer's
    /// brightness, so a fade written as a gray ramp is carried here as the
    /// alpha that gray would have produced. For an opaque gray ramp the two are
    /// the same number — sRGB luminance of a neutral is the neutral itself —
    /// so only the mechanism is approximated, not the result.
    private static func fade(_ stops: [(CGFloat, Int)]) -> Gradient {
        Gradient(stops: stops.map { offset, gray in
            .init(color: .white.opacity(Double(gray) / 255), location: offset)
        })
    }
}

/// The two things the mark takes from the ground it sits on: how much light the
/// body scatters, and how strong its halo is. Everything else keeps one value
/// on both grounds.
///
/// On a light page the glass is nearly clear and the page reads straight
/// through it. On a near-black one the scatter *is* the body — a near-solid,
/// near-flat white underlay — because a partial scatter reads as gray and the
/// eyes vanish into it.
public struct HausGhostGround: Sendable, Equatable {
    let scatter: Double
    let scatterPeak: Double
    let scatterMid: Double
    let scatterOuter: Double
    let halo: Double

    static let light = HausGhostGround(
        scatter: 0.1,
        scatterPeak: 1,
        scatterMid: 0.72,
        scatterOuter: 0.3,
        halo: 0.22
    )

    static let dark = HausGhostGround(
        scatter: 0.94,
        scatterPeak: 1,
        scatterMid: 0.98,
        scatterOuter: 0.96,
        halo: 0.3
    )

    static func of(_ scheme: ColorScheme) -> HausGhostGround {
        scheme == .dark ? .dark : .light
    }

    /// The interior radial's stops: the rect's own `fill-opacity` times each
    /// stop's share of it, folded into one alpha per stop.
    var interiorGradient: Gradient {
        Gradient(stops: [
            .init(color: .white.opacity(scatter * scatterPeak), location: 0),
            .init(color: .white.opacity(scatter * scatterMid), location: 0.6),
            .init(color: .white.opacity(scatter * scatterOuter), location: 1),
        ])
    }
}
