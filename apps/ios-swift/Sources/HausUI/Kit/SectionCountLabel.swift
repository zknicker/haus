import SwiftUI

/// A list section's label with its count beside it: "In progress 3".
struct SectionCountLabel: View {
    private let title: String
    private let count: Int?

    init(_ title: String, count: Int? = nil) {
        self.title = title
        self.count = count
    }

    var body: some View {
        HStack(spacing: 8) {
            Text(title)
            if let count {
                Text(count, format: .number)
                    .monospacedDigit()
            }
        }
        .hausFont(.sectionLabel)
        .foregroundStyle(HausPlatformColor.mutedInk)
        .lineLimit(1)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}
