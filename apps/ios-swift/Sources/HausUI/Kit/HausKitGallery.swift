#if DEBUG
import SwiftUI

/// Every kit primitive on the Haus canvas, for previews in both schemes.
struct HausKitGallery: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                group("Palette", count: Self.tones.count) { palette }
                group("Filter chips") { chips }
                group("Section labels") { sectionLabels }
                group("Captain marks") { captainMarks }
                group("Glass") { glass }
            }
            .padding(.vertical, 24)
        }
        .background(HausPlatformColor.canvas)
    }

    private var palette: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 12)], spacing: 12) {
            ForEach(Self.tones, id: \.name) { entry in
                VStack(alignment: .leading, spacing: 6) {
                    RoundedRectangle.haus(HausRadius.small)
                        .fill(entry.tone.color)
                        .frame(height: 36)
                        .overlay {
                            RoundedRectangle.haus(HausRadius.small)
                                .strokeBorder(HausPlatformColor.edge)
                        }
                    Text(entry.name)
                        .font(HausFont.font(size: 12))
                        .foregroundStyle(HausPlatformColor.mutedInk)
                }
            }
        }
        .padding(.horizontal, 20)
    }

    private var chips: some View {
        VStack(alignment: .leading, spacing: 12) {
            FilterChipRow {
                FilterChip("Open", isSelected: true, accessory: .menu) {}
                FilterChip("Mine", accessory: .menu) {}
                FilterChip("Filter", accessory: .add) {}
            }
            FilterChipRow {
                FilterChip("All", isSelected: true) {}
                FilterChip("Workers") {}
                FilterChip("Pull requests") {}
                FilterChip("Files") {}
                FilterChip("Reminders") {}
            }
        }
    }

    private var sectionLabels: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionCountLabel("Waiting on you", count: 1)
            SectionCountLabel("In progress", count: 3)
            SectionCountLabel("Recent")
        }
        .padding(.horizontal, 20)
    }

    private var captainMarks: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 36) {
                CaptainMark(name: "Blippy", tint: Self.blue, side: 63, isWorking: true)
                CaptainMark(name: "Tiny", tint: Self.orange, side: 63, isUnread: true)
                CaptainMark(name: "Juniper", tint: Self.green, side: 63)
            }
            HStack(alignment: .bottom, spacing: 16) {
                ForEach([48, 32, 24, 20, 16] as [CGFloat], id: \.self) { side in
                    CaptainMark(name: "Forge", tint: Self.violet, side: side, isWorking: side >= 32)
                }
            }
        }
        .padding(.horizontal, 20)
    }

    private var glass: some View {
        VStack(spacing: 20) {
            GlassToast(toast: HausToast("Branch copied", systemImage: "checkmark"))
            GlassEffectContainer {
                HStack(spacing: 12) {
                    WorkPill(count: 1) {}
                    WorkPill(count: 12) {}
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .background(HausPlatformColor.card, in: .haus(HausRadius.large))
        .padding(.horizontal, 20)
    }

    private func group(
        _ title: String,
        count: Int? = nil,
        @ViewBuilder content: () -> some View
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionCountLabel(title, count: count)
                .padding(.horizontal, 20)
            content()
        }
    }

    private static let blue = Color(red: 0x3F / 255, green: 0x8C / 255, blue: 0xF5 / 255)
    private static let orange = Color(red: 0xF5 / 255, green: 0x9A / 255, blue: 0x52 / 255)
    private static let green = Color(red: 0x4C / 255, green: 0xC3 / 255, blue: 0x8A / 255)
    private static let violet = Color(red: 0x9A / 255, green: 0x80 / 255, blue: 0xF0 / 255)

    private static let tones: [(name: String, tone: HausTone)] = [
        ("canvas", .canvas),
        ("elevatedCanvas", .elevatedCanvas),
        ("card", .card),
        ("fill", .fill),
        ("strongFill", .strongFill),
        ("ink", .ink),
        ("mutedInk", .mutedInk),
        ("faintInk", .faintInk),
        ("hairline", .hairline),
        ("edge", .edge),
        ("accent", .accent),
        ("accentInk", .accentInk),
        ("selectedFill", .selectedFill),
        ("selectedInk", .selectedInk),
        ("positive", .positive),
        ("caution", .caution),
        ("critical", .critical),
    ]
}

#Preview("Kit, dark") {
    HausKitGallery()
        .preferredColorScheme(.dark)
}

#Preview("Kit, light") {
    HausKitGallery()
        .preferredColorScheme(.light)
}

#Preview("Toast presentation") {
    HausPlatformColor.canvas
        .ignoresSafeArea()
        .glassToast(HausToast("Branch copied", systemImage: "checkmark"))
}
#endif
