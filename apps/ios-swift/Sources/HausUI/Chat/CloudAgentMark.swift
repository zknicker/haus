import SwiftUI

struct CloudAgentMark: View {
    enum Style { case tile, glyph }
    var size: CGFloat = 36
    var style: Style = .tile

    var body: some View {
        CursorGlyph()
            .fill(.primary)
            .frame(width: size * (style == .glyph ? 466.73 / 532.09 : 0.52),
                   height: size * (style == .glyph ? 1 : 0.60))
            .frame(width: size, height: size)
            .background {
                if style == .tile {
                    RoundedRectangle.haus(HausRadius.mark(side: size))
                        .fill(HausPlatformColor.inputSurface)
                }
            }
            .accessibilityHidden(true)
    }
}

private struct CursorGlyph: Shape {
    // The same svgl Cursor mark used by the web App, rendered locally.
    private static let outline = SVGPathData.path(from:
        "M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z"
    )

    func path(in rect: CGRect) -> Path {
        Self.outline.applying(CGAffineTransform(scaleX: rect.width / 466.73, y: rect.height / 532.09))
    }
}
