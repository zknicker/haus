import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// One die-cut emoji sticker, leaning ±8° by its place in the pile. While a
/// stamp runs it is sampled per frame from `StampMotion`, with its landing
/// burst underneath; otherwise it sits at rest.
struct ReactionStickerView: View {
    let messageID: String
    let sticker: ReactionSticker
    /// Its place in the pile, which sets the way it leans.
    let index: Int
    let stamp: ReactionStamp?
    let onToggle: (() -> Void)?

    static let box: CGFloat = 24

    var body: some View {
        let tilt = StickerPose.tilt(index: index)
        Button { onToggle?() } label: {
            Color.clear
                .frame(width: Self.box, height: Self.box)
                .overlay { stamped(tilt: tilt) }
                .contentShape(.rect)
        }
        .buttonStyle(StickerButtonStyle())
        .disabled(onToggle == nil)
        .offset(y: 2)
        .accessibilityLabel("\(sticker.emoji) from \(sticker.reactor.name)")
        .accessibilityAddTraits(sticker.isOwn ? .isSelected : [])
        .accessibilityHint(sticker.isOwn ? "Removes your reaction" : "Adds this reaction")
    }

    @ViewBuilder
    private func stamped(tilt: Double) -> some View {
        if let stamp {
            TimelineView(.animation) { context in
                let elapsed = context.date.timeIntervalSince(stamp.start)
                let motion = StampMotion.pose(at: elapsed)
                ZStack {
                    StickerBurst(
                        seed: StickerPose.seed(messageID: messageID, sticker: sticker),
                        elapsed: elapsed - StampMotion.landTime
                    )
                    .offset(y: 4.8)
                    StickerGlyph(emoji: sticker.emoji)
                        .rotationEffect(.degrees(tilt + motion.rotation))
                        .scaleEffect(x: motion.scaleX, y: motion.scaleY)
                        .opacity(motion.opacity)
                }
            }
            .id(stamp.token)
        } else {
            StickerGlyph(emoji: sticker.emoji)
                .rotationEffect(.degrees(tilt))
        }
    }
}

/// Lifts a pressed sticker a little, like a thumb peeling it up.
private struct StickerButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 1.12 : 1)
            .offset(y: configuration.isPressed ? -3 : 0)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// The emoji drawn as its cached die-cut bitmap, scaled to the 20pt sticker.
/// Until the bitmap lands the plain glyph stands in at the same size.
struct StickerGlyph: View {
    let emoji: String
    #if canImport(UIKit)
    /// Dark mode cuts a quieter outline, so the finish follows the appearance
    /// and a trait change re-renders through the cache.
    @Environment(\.colorScheme) private var colorScheme
    /// The bitmap this view rendered, tagged with its emoji and finish so a
    /// reused view never shows another sticker's image.
    @State private var loaded: (key: String, image: UIImage)?
    private static let renderScale: CGFloat = 2
    #endif

    var body: some View {
        #if canImport(UIKit)
        let finish = StickerFinish.of(colorScheme)
        let loadKey = "\(emoji)|\(finish.id)"
        let image = StickerImageRenderer.cached(emoji, finish: finish, scale: Self.renderScale)
            ?? (loaded?.key == loadKey ? loaded?.image : nil)
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .interpolation(.high)
                    .frame(
                        width: image.size.width * StickerImageRenderer.displayScale,
                        height: image.size.height * StickerImageRenderer.displayScale
                    )
                    .offset(y: -1)
            } else {
                plain
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task(id: loadKey) {
            guard StickerImageRenderer.cached(emoji, finish: finish, scale: Self.renderScale) == nil,
                  let image = await StickerImageRenderer.image(emoji, finish: finish, scale: Self.renderScale)
            else { return }
            loaded = (loadKey, image)
        }
        #else
        plain
        #endif
    }

    private var plain: some View {
        Text(emoji)
            .font(.system(size: 20))
            .fixedSize()
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
