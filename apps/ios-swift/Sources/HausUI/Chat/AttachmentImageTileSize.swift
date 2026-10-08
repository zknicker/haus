import CoreGraphics

/// Pure sizing logic for the hero tile — the box a message's single image gets.
///
/// The box is the image at its own native point size (pixels ÷ the screen's
/// scale), fitted inside `maxWidth` × `maxHeight` and never enlarged past it: a
/// 256-pixel icon is 85pt on a 3x display, and drawing it 180pt tall was the
/// blur Haus shipped before. Each side is then floored at `minSide` so a tiny
/// icon still has a comfortable tap target, and the bitmap fill-crops wherever
/// a floor or the width cap changed the aspect — which is also what keeps a
/// panorama a readable band instead of a 24pt sliver.
enum AttachmentImageTileSize {
    static let maxWidth: CGFloat = 240
    static let maxHeight: CGFloat = 180
    static let minSide: CGFloat = 96
    /// What the tile reserves before a decode lands. A downloaded image's pixel
    /// size is not in the Server's attachment record, so the box only becomes
    /// knowable with the bitmap; reserving the largest box is the least-jumpy
    /// honest answer, because most images are photographs and screenshots that
    /// fill it. A staged local file is decoded before its row lays out, so a
    /// pending upload never sees this.
    static let placeholderSize = CGSize(width: maxWidth, height: maxHeight)
    /// The tile's clip, shared by the strip's squares. The viewer's zoom source
    /// anchor wears the same radius, so the card's corners start exactly where
    /// the tile's end.
    static let cornerRadius: CGFloat = HausRadius.medium

    static func fitted(
        pixelWidth: Int,
        pixelHeight: Int,
        scale: CGFloat
    ) -> CGSize {
        guard pixelWidth > 0, pixelHeight > 0, scale > 0 else { return placeholderSize }
        let nativeWidth = CGFloat(pixelWidth) / scale
        let nativeHeight = CGFloat(pixelHeight) / scale
        let aspect = CGFloat(pixelWidth) / CGFloat(pixelHeight)
        let height = clamped(min(maxHeight, nativeHeight), max: maxHeight)
        let width = clamped(min(nativeWidth, height * aspect), max: maxWidth)
        return CGSize(width: width.rounded(), height: height.rounded())
    }

    private static func clamped(_ value: CGFloat, max limit: CGFloat) -> CGFloat {
        min(limit, Swift.max(minSide, value))
    }
}

/// Pure sizing logic for the strip — the row two or more images share.
///
/// Two images that each took a hero tile stacked into a wall of picture. Side
/// by side as uniform squares they read as one attachment group, and the size
/// follows the message column rather than a constant: about three squares fit
/// across it with the strip's own gap between them, and anything past that
/// scrolls sideways inside the row. The square is bounded at both ends so a
/// narrow phone cannot shrink it below a tap target and a wide one cannot turn
/// three thumbnails back into three heroes.
enum AttachmentImageStripSize {
    static let gap: CGFloat = 6
    static let acrossColumn = 3
    static let minSquare: CGFloat = 84
    static let maxSquare: CGFloat = 112
    /// What the strip draws with until it has measured its column. Every
    /// current iPhone lands within a point or two of it.
    static let defaultSquare: CGFloat = 104

    static func square(columnWidth: CGFloat) -> CGFloat {
        guard columnWidth > 0 else { return defaultSquare }
        let gaps = gap * CGFloat(acrossColumn - 1)
        let side = ((columnWidth - gaps) / CGFloat(acrossColumn)).rounded(.down)
        return min(maxSquare, max(minSquare, side))
    }
}
