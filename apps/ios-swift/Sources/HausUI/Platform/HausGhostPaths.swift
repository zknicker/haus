import CoreGraphics
import SwiftUI

/// The ghost silhouette, shared by the tintable fill and the glass stack so the
/// clip, the rim strokes, and the hairline edge all trace the exact same curve.
///
/// The path data is the web mark's, character for character
/// (`apps/website/src/components/haus-ghost-paths.ts`), which is the source of
/// truth for the shape on every Haus surface. Both clients parse the same
/// string rather than keeping two traces that could drift apart.
public enum HausGhostPaths {
    /// The unit space every number in the mark is expressed in.
    public static let viewBoxWidth: CGFloat = 192
    public static let viewBoxHeight: CGFloat = 204

    public static let bodyData =
        "M86.54 199.53c-2.86 -0.07 -6.31 -0.72 -9.1 -1.77 -2.79 -1.05 -5.26 -2.45 -7.65 -4.53 -2.39 -2.09 -4.49 -4.65 -6.68 -7.98 -2.19 -3.33 -4.62 -9.28 -6.46 -11.97 -1.84 -2.7 -3.01 -3.37 -4.57 -4.22 -1.57 -0.84 -2.19 -1.07 -4.84 -0.84 -2.65 0.23 -7.66 1.81 -11.03 2.24 -3.37 0.43 -6.45 0.49 -9.19 0.33 -2.74 -0.16 -5.05 -0.63 -7.26 -1.27 -2.21 -0.64 -4.16 -1.46 -6 -2.56 -1.84 -1.1 -3.69 -2.56 -5.07 -4.04 -1.38 -1.48 -2.41 -3.16 -3.19 -4.84 -0.78 -1.68 -1.26 -3.37 -1.5 -5.23 -0.24 -1.85 -0.5 -3.5 0.05 -5.9 0.54 -2.4 0.88 -4.86 3.2 -8.52 2.33 -3.66 8 -9.4 10.77 -13.44 2.77 -4.03 4.46 -7.21 5.87 -10.76 1.41 -3.55 1.76 -4.44 2.61 -10.55 0.85 -6.11 1.61 -19.53 2.47 -26.13 0.86 -6.6 1.28 -8.63 2.67 -13.45 1.39 -4.82 3.16 -10.4 5.66 -15.49 2.51 -5.08 5.5 -10.21 9.37 -15 3.87 -4.79 9.83 -10.36 13.83 -13.74 4 -3.38 6.82 -4.71 10.16 -6.54 3.34 -1.83 5.19 -2.98 9.87 -4.46 4.68 -1.48 11.34 -3.77 18.2 -4.4 6.86 -0.62 17.05 0.04 22.94 0.66 5.89 0.62 8.81 1.93 12.39 3.05 3.58 1.12 6.21 2.31 9.08 3.65 2.87 1.34 5.14 2.44 8.15 4.41 3 1.97 6.01 3.63 9.87 7.41 3.86 3.78 9.55 9.72 13.27 15.28 3.72 5.56 6.97 12.65 9.07 18.1 2.11 5.45 2.82 9.71 3.57 14.61 0.75 4.9 1.13 9.97 0.93 14.81 -0.2 4.84 -0.9 8.6 -2.13 14.23 -1.24 5.63 -4.25 14.16 -5.29 19.55 -1.04 5.39 -1.06 8.98 -0.96 12.78 0.1 3.79 0.2 5.1 1.54 9.97 1.33 4.87 5.33 14.08 6.46 19.26 1.13 5.18 0.59 8.76 0.31 11.81 -0.28 3.05 -1.04 4.42 -2.01 6.48 -0.97 2.06 -2.24 4.16 -3.8 5.9 -1.56 1.75 -3.42 3.3 -5.55 4.58 -2.13 1.27 -4.61 2.41 -7.26 3.05 -2.65 0.65 -5.89 0.95 -8.61 0.83 -2.73 -0.12 -5.34 -0.82 -7.74 -1.57 -2.4 -0.75 -3.36 -0.93 -6.68 -2.95 -3.32 -2.02 -9.87 -7.38 -13.26 -9.18 -3.39 -1.81 -4.84 -1.76 -7.07 -1.65 -2.23 0.11 -2.07 -0.37 -6.29 2.31 -4.22 2.68 -14.84 11.06 -19.02 13.78 -4.18 2.73 -3.7 1.92 -6.05 2.57 -2.35 0.65 -5.18 1.41 -8.03 1.33z"

    /// Both eyes are exact stadiums — two straight flanks closed by
    /// semicircular caps — so the ends stay round at any size. Centers, tilt,
    /// width, and length come from the app-icon eye layer; the caps are
    /// quarter-circle cubics at the 0.5523 kappa.
    public static let eyesData =
        "M116.412 64.907L115.117 88.892C114.702 96.582 108.131 102.479 100.442 102.064C92.752 101.649 86.854 95.078 87.27 87.389L88.565 63.404C88.98 55.714 95.551 49.817 103.24 50.232C110.93 50.647 116.828 57.218 116.412 64.907zM155.559 64.083L156.29 86.815C156.523 94.063 150.836 100.126 143.589 100.359C136.342 100.592 130.278 94.906 130.045 87.659L129.314 64.927C129.081 57.679 134.768 51.616 142.015 51.383C149.262 51.15 155.326 56.836 155.559 64.083z"

    // Parsed once, by the same reader the channel glyphs use.
    public static let body = SVGPathData.path(from: bodyData)
    public static let eyes = SVGPathData.path(from: eyesData)

    /// Body and eyes as one path, so an even-odd fill punches the eyes out as
    /// holes and whatever sits behind the mark reads through them.
    public static let silhouette: Path = {
        var combined = body
        combined.addPath(eyes)
        return combined
    }()

    /// The mark's drawn width for a requested height.
    public static func width(forHeight height: CGFloat) -> CGFloat {
        height * viewBoxWidth / viewBoxHeight
    }

    /// Unit space to points. Every length, point, and blur radius in the glass
    /// stack goes through this, so the whole mark scales as one.
    public static func scale(forHeight height: CGFloat) -> CGFloat {
        height / viewBoxHeight
    }

    public static func scaled(_ path: Path, by scale: CGFloat) -> Path {
        path.applying(CGAffineTransform(scaleX: scale, y: scale))
    }
}
