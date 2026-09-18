import SwiftUI

/// A message body: its blocks, and inside each one its words and its `@mention`
/// chips in a single run of text.
///
/// A mention is a run of the sentence, not a picture of one. It is set in the
/// body font at the body size on the body's own baseline, and the capsule and
/// identity mark are painted behind it by the text engine — so the words after
/// a chip keep their rhythm, a chip's line keeps the pitch of a plain line, and
/// a selection drags straight through the mention.
struct RichMessageContentView: View {
    let blocks: [RichMessageBlock]
    var textStyle: Font.TextStyle = .body

    /// Avatars arrive after the first frame. Recording the ones that landed
    /// invalidates this body, which repaints those marks with the image in
    /// place of their initials. It is an invalidation trigger only; whether an
    /// avatar is drawable is `AvatarImageCache`'s answer.
    @State private var loadedAvatarURLs: Set<URL> = []

    var body: some View {
        VStack(alignment: .leading, spacing: Self.blockSpacing) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { index, block in
                RichMessageBlockView(
                    block: block,
                    textStyle: textStyle,
                    markRevision: markRevision
                )
                .padding(.top, headingInset(for: block, at: index))
            }
        }
        .task { ChannelIconCatalog.shared.load() }
        .task(id: avatarURLs) { await loadAvatars() }
    }

    /// The App sets one prose measure of air between blocks. The phone's body
    /// is larger than the web's, so the gap is the same proportion rather than
    /// the same pixels.
    private static let blockSpacing: CGFloat = 9

    /// A heading opens a section, so it stands further from the block above it
    /// than two paragraphs stand from each other — and not at all when it is
    /// the first thing the message says.
    private func headingInset(for block: RichMessageBlock, at index: Int) -> CGFloat {
        guard index > 0, case .heading = block else { return 0 }
        return 4
    }

    /// Everything a mark's pixels depend on beyond the text itself. The
    /// avatar's presence is `AvatarImageCache`'s answer alone, never a
    /// per-view set: the cache restores an evicted avatar from its disk bytes
    /// and only reports absence once those are gone too, so a recycled row
    /// cannot flip a drawn avatar back to initials. Reading the channel
    /// catalog here is also what subscribes this body to its one-time load.
    private var markRevision: Int {
        var hasher = Hasher()
        hasher.combine(loadedAvatarURLs)
        for case .reference(let reference) in blocks.flatMap(\.segments) {
            if let url = reference.avatarURL {
                hasher.combine(AvatarImageCache.shared.image(for: url) != nil)
            }
            if reference.kind == .channel {
                let appearance = reference.channelAppearance ?? .default
                hasher.combine(ChannelIconCatalog.shared.subpaths(for: appearance.icon) != nil)
            }
        }
        return hasher.finalize()
    }

    private var avatarURLs: [URL] {
        blocks.flatMap(\.segments).compactMap { segment in
            guard case .reference(let reference) = segment else { return nil }
            return reference.avatarURL
        }
    }

    private func loadAvatars() async {
        for url in avatarURLs where AvatarImageCache.shared.image(for: url) == nil {
            guard await AvatarImageCache.shared.load(url: url) != nil else { continue }
            loadedAvatarURLs.insert(url)
        }
    }
}
