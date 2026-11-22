import SwiftUI

/// A Captain's monogram tint, stable for its id across launches.
enum CaptainTint {
    static let palette: [HausTone] = [
        HausTone(HausSwatch(0x3F8CF5)),
        HausTone(HausSwatch(0xF59A52)),
        HausTone(HausSwatch(0x4CC38A)),
        HausTone(HausSwatch(0x9A80F0)),
        HausTone(HausSwatch(0xE5675F)),
        HausTone(HausSwatch(0x3CB8C9)),
    ]

    /// FNV-1a over the id's bytes: `hashValue` is reseeded every launch.
    static func index(for id: String) -> Int {
        let hash = id.utf8.reduce(UInt32(2_166_136_261)) { ($0 ^ UInt32($1)) &* 16_777_619 }
        return Int(hash % UInt32(palette.count))
    }

    static func color(for id: String) -> Color {
        palette[index(for: id)].color
    }
}

/// A Captain mark at `side`: the Captain's avatar when it has one, else its
/// initial on its tint, with the working badge and unread dot when asked.
struct CaptainFaceMark: View {
    let captain: CaptainIdentity
    let side: CGFloat
    var isWorking = false
    var isUnread = false

    @State private var imageLoadState = AvatarImageLoadState<AvatarPlatformImage>()

    var body: some View {
        CaptainMark(name: captain.name, side: side, isWorking: isWorking, isUnread: isUnread) {
            ZStack {
                CaptainMonogram(
                    initial: CaptainMonogram.initial(of: captain.name),
                    tint: CaptainTint.color(for: captain.id),
                    fontSize: CaptainMarkGeometry(side: side).initialSize
                )
                if let image = displayedImage {
                    Self.platformImage(image)
                        .resizable()
                        .scaledToFill()
                }
            }
        }
        .task(id: captain.avatarURL) { await loadImage() }
    }

    private var displayedImage: AvatarPlatformImage? {
        guard let url = captain.avatarURL else { return nil }
        return imageLoadState.value(for: url) ?? AvatarImageCache.shared.image(for: url)
    }

    private func loadImage() async {
        imageLoadState.begin(url: captain.avatarURL)
        guard let url = captain.avatarURL else { return }
        let image = await AvatarImageCache.shared.load(url: url)
        imageLoadState.complete(value: image, for: url, isCancelled: Task.isCancelled)
    }

    private static func platformImage(_ image: AvatarPlatformImage) -> Image {
        #if canImport(UIKit)
        Image(uiImage: image)
        #else
        Image(nsImage: image)
        #endif
    }
}
