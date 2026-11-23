import SwiftUI

/// A Captain's squircle mark showing its avatar, or its initial on the accent until the avatar
/// loads or when it has none.
struct CaptainAvatarMark: View {
    let name: String
    let url: URL?
    let side: CGFloat

    @State private var loadState = AvatarImageLoadState<AvatarPlatformImage>()

    var body: some View {
        let geometry = CaptainMarkGeometry(side: side)
        CaptainMark(name: name, side: side) {
            if let image = displayedImage {
                platformImage(image).resizable().scaledToFill()
            } else {
                CaptainMonogram(
                    initial: CaptainMonogram.initial(of: name),
                    tint: HausPlatformColor.accent,
                    fontSize: geometry.initialSize
                )
            }
        }
        .task(id: url) {
            loadState.begin(url: url)
            guard let url else { return }
            let image = await AvatarImageCache.shared.load(url: url)
            loadState.complete(value: image, for: url, isCancelled: Task.isCancelled)
        }
    }

    private var displayedImage: AvatarPlatformImage? {
        guard let url else { return nil }
        return loadState.value(for: url) ?? AvatarImageCache.shared.image(for: url)
    }

    private func platformImage(_ image: AvatarPlatformImage) -> Image {
        #if canImport(UIKit)
        Image(uiImage: image)
        #elseif canImport(AppKit)
        Image(nsImage: image)
        #endif
    }
}

/// A Captain's mark and name on one line.
struct CaptainIdentityLabel: View {
    let typist: ChatTypist
    let side: CGFloat

    var body: some View {
        HStack(spacing: 8) {
            CaptainAvatarMark(name: typist.name, url: typist.avatarURL, side: side)
            Text(typist.name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(HausPlatformColor.ink)
        }
        .accessibilityElement(children: .combine)
    }
}
