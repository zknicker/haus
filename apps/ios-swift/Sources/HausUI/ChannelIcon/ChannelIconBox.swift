import SwiftUI

/// A channel's glyph in its colored box.
///
/// This is the App's `ChannelIconBox` in SwiftUI: the chosen catalog glyph
/// tinted with the preset's per-scheme value, sitting in the same tint at the
/// low alpha the App mixes for the box. A channel with no icon, no color, an
/// unknown name, or a catalog that has not finished loading renders the hash in
/// a muted box, so the box geometry never moves.
public struct ChannelIconBox: View {
    public enum BoxShape: Sendable {
        case roundedRect
        case circle
    }

    private let appearance: ChannelAppearance
    private let size: CGFloat
    private let glyphSize: CGFloat
    private let shape: BoxShape

    @Environment(\.colorScheme) private var colorScheme

    public init(
        appearance: ChannelAppearance,
        size: CGFloat,
        glyphSize: CGFloat? = nil,
        shape: BoxShape = .roundedRect
    ) {
        self.appearance = appearance
        self.size = size
        // The App pairs a 24pt box with a 16pt glyph.
        self.glyphSize = glyphSize ?? (size * 2 / 3).rounded()
        self.shape = shape
    }

    public var body: some View {
        glyph
            .frame(width: size, height: size)
            .background(boxFill, in: boxShape)
            .accessibilityHidden(true)
            .task { ChannelIconCatalog.shared.load() }
    }

    private var glyph: some View {
        ChannelGlyphShape(appearance: appearance, size: glyphSize, weight: 2)
            .foregroundStyle(tint ?? .secondary)
    }

    private var tint: Color? {
        ChannelColorPalette.preset(for: appearance.color)?.tint(colorScheme)
    }

    /// The muted default matches the App's neutral `default` token: a low-alpha
    /// wash of the foreground rather than a fixed grey.
    private var boxFill: Color {
        ChannelColorPalette.preset(for: appearance.color)?.boxFill(colorScheme)
            ?? Self.mutedFill(colorScheme)
    }

    /// The neutral box, shared with any mark that sits in a Channel's column.
    static func mutedFill(_ colorScheme: ColorScheme) -> Color {
        Color.primary.opacity(colorScheme == .dark ? 0.12 : 0.075)
    }

    /// The box's corner follows its size, so a larger box keeps its shape.
    static func cornerRadius(for size: CGFloat) -> CGFloat {
        HausRadius.mark(side: size)
    }

    private var boxShape: AnyShape {
        switch shape {
        case .circle:
            AnyShape(Circle())
        case .roundedRect:
            AnyShape(RoundedRectangle(cornerRadius: Self.cornerRadius(for: size), style: .continuous))
        }
    }
}

/// A channel's glyph with no box, for a list row's lead column: the preset's
/// tint when the channel has one, otherwise the muted ink.
public struct ChannelGlyph: View {
    private let appearance: ChannelAppearance
    private let size: CGFloat

    @Environment(\.colorScheme) private var colorScheme

    public init(appearance: ChannelAppearance, size: CGFloat) {
        self.appearance = appearance
        self.size = size
    }

    public var body: some View {
        ChannelGlyphShape(appearance: appearance, size: size, weight: 1.5)
            .foregroundStyle(ChannelColorPalette.preset(for: appearance.color)?.tint(colorScheme) ?? HausPlatformColor.mutedInk)
            .accessibilityHidden(true)
            .task { ChannelIconCatalog.shared.load() }
    }
}

/// The catalog glyph for a channel, or the hash while the catalog loads or
/// when the channel has none.
private struct ChannelGlyphShape: View {
    let appearance: ChannelAppearance
    let size: CGFloat
    let weight: CGFloat

    var body: some View {
        if let subpaths = ChannelIconCatalog.shared.subpaths(for: appearance.icon) {
            HugeiconGlyph(subpaths: subpaths)
                .frame(width: size, height: size)
        } else {
            HausIcon(.channel, size: size, weight: weight)
        }
    }
}

/// Draws parsed unit-square hugeicons subpaths at the size the caller asked
/// for. Shared by the channel glyphs and the app icon set, which differ only in
/// which hugeicons family their geometry was generated from.
struct HugeiconGlyph: View {
    let subpaths: [HugeiconSubpath]

    var body: some View {
        GeometryReader { proxy in
            let scale = min(proxy.size.width, proxy.size.height)
            ZStack {
                ForEach(Array(subpaths.enumerated()), id: \.offset) { _, subpath in
                    let path = subpath.path.applying(
                        CGAffineTransform(scaleX: scale, y: scale)
                    )
                    if let stroke = subpath.stroke {
                        path.stroke(
                            style: StrokeStyle(
                                lineWidth: stroke.width * scale,
                                lineCap: stroke.cap,
                                lineJoin: stroke.join
                            )
                        )
                    } else {
                        path.fill(style: FillStyle(eoFill: subpath.evenOdd))
                    }
                }
            }
        }
    }
}

#Preview("Channel icons") {
    VStack(alignment: .leading, spacing: 16) {
        ForEach(["RocketIcon", "CompassIcon", "TruckIcon", "IrisScanIcon"], id: \.self) { icon in
            HStack(spacing: 12) {
                ChannelIconBox(
                    appearance: ChannelAppearance(icon: icon, color: "amber"),
                    size: 26
                )
                ChannelIconBox(
                    appearance: ChannelAppearance(icon: icon, color: "violet"),
                    size: 40
                )
                ChannelIconBox(
                    appearance: ChannelAppearance(icon: icon, color: nil),
                    size: 26
                )
                Text(icon).font(.subheadline)
            }
        }
        ChannelIconBox(appearance: .default, size: 72, glyphSize: 34, shape: .circle)
    }
    .padding()
}
