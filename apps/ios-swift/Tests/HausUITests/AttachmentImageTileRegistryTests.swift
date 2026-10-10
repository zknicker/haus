import CoreGraphics
import Testing
@testable import HausUI

/// A hero tile reserves the largest box until its decode lands, then settles
/// to the picture's own size. The row is hosted in a cell that keeps the
/// height it first measured, so the settle has to reach the screen as a
/// revision, or the shrunken tile draws over the text above it.
@MainActor
struct AttachmentImageTileRegistryTests {
    @Test func coalescesResizesInOneTurnIntoOneRevision() async {
        let registry = AttachmentImageTileRegistry()

        registry.noteTileResized()
        registry.noteTileResized()
        registry.noteTileResized()
        #expect(registry.revision == 0)

        await Task.yield()

        #expect(registry.revision == 1)
    }

    @Test func bumpsAgainOnALaterTurn() async {
        let registry = AttachmentImageTileRegistry()

        registry.noteTileResized()
        await Task.yield()
        registry.noteTileResized()
        await Task.yield()

        #expect(registry.revision == 2)
    }

    /// The case seen in #all: a 96pt generated avatar settling out of the
    /// 240x180 placeholder changes the hero box, and a square never does.
    @Test func aSmallImageChangesTheHeroBoxButNotAStripSquare() {
        let settled = AttachmentImageTileSize.fitted(pixelWidth: 256, pixelHeight: 256, scale: 3)

        #expect(settled == CGSize(width: 96, height: 96))
        #expect(settled != AttachmentImageTileSize.placeholderSize)
        #expect(
            AttachmentImageTileBox.square(104).size(for: nil)
                == CGSize(width: 104, height: 104)
        )
    }
}
