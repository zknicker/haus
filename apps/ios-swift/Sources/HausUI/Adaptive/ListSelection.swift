import SwiftUI

extension View {
    /// The one selection treatment in a list beside a content pane
    /// (specs/ios-app.md, iPhone Duo): a fill-tinted row with medium corners,
    /// never an accent fill.
    public func listSelection(_ isSelected: Bool) -> some View {
        background {
            if isSelected {
                HausPlatformColor.selectedRow.clipShape(.haus(HausRadius.medium))
            }
        }
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
