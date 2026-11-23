import SwiftUI

#if canImport(UIKit)

/// The bar's icons over a system segmented control. On iOS 26 the segmented
/// control is the one component besides the system tab bar whose selection
/// lifts into the Liquid Glass bubble on a press and follows the finger, so the
/// bar gets that native feel at Capy's 49pt instead of the system bar's 62pt.
/// The control draws only its selection; the icons sit over it and let touches
/// through.
struct HausTabBar<Tab: Hashable>: View {
    @Binding var selection: Tab
    let items: [HausTabBarItem<Tab>]

    private static var inset: CGFloat { 3 }

    var body: some View {
        TabSegmentedControl(
            count: items.count,
            selectedIndex: Binding(
                get: { items.firstIndex { $0.tab == selection } ?? 0 },
                set: { index in if items.indices.contains(index) { selection = items[index].tab } }
            )
        )
        .accessibilityHidden(true)
        .overlay {
            HStack(spacing: 0) {
                ForEach(items) { item in
                    HausTabBarIcon(item: item, isSelected: item.tab == selection)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .contentShape(.rect)
                        .accessibilityElement()
                        .accessibilityLabel(item.label)
                        .accessibilityAddTraits(item.tab == selection ? [.isButton, .isSelected] : .isButton)
                        .accessibilityAction { selection = item.tab }
                }
            }
            .allowsHitTesting(false)
        }
        .padding(Self.inset)
        .frame(height: HausBottomChrome<Tab>.barHeight)
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// A segmented control that shows only its selection: no track, no
/// dividers, no titles. The selection is the piece iOS 26 turns into glass.
private struct TabSegmentedControl: UIViewRepresentable {
    let count: Int
    @Binding var selectedIndex: Int

    func makeUIView(context: Context) -> TracklessSegmentedControl {
        let control = TracklessSegmentedControl(items: Array(repeating: "", count: count))
        control.selectedSegmentIndex = selectedIndex
        control.backgroundColor = .clear
        control.selectedSegmentTintColor = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor.black.withAlphaComponent(0.45)
                : UIColor.black.withAlphaComponent(0.07)
        }
        control.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .valueChanged)
        return control
    }

    func updateUIView(_ control: TracklessSegmentedControl, context: Context) {
        context.coordinator.selectedIndex = $selectedIndex
        if control.selectedSegmentIndex != selectedIndex {
            control.selectedSegmentIndex = selectedIndex
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: TracklessSegmentedControl, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? 0, height: proposal.height ?? 0)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(selectedIndex: $selectedIndex)
    }

    final class Coordinator: NSObject {
        var selectedIndex: Binding<Int>

        init(selectedIndex: Binding<Int>) {
            self.selectedIndex = selectedIndex
        }

        @objc func changed(_ control: UISegmentedControl) {
            selectedIndex.wrappedValue = control.selectedSegmentIndex
        }
    }
}

/// Hides the control's track and dividers, which UIKit draws as image views
/// under the selection indicator (the last subview). This leans on UIKit's
/// private layout: if a later iOS changes it, the track shows again under the
/// glass bar rather than anything breaking.
final class TracklessSegmentedControl: UISegmentedControl {
    override func layoutSubviews() {
        super.layoutSubviews()
        let indicator = subviews.last
        for case let view as UIImageView in subviews where view !== indicator {
            view.alpha = 0
        }
    }
}

/// A tab's photo or symbol. The selection alone marks a photo; a symbol
/// also takes the accent.
struct HausTabBarIcon<Tab: Hashable>: View {
    let item: HausTabBarItem<Tab>
    let isSelected: Bool

    var body: some View {
        if let image = item.image {
            image
                .resizable()
                .frame(width: 26, height: 26)
                .clipShape(Circle())
        } else {
            Image(systemName: item.systemImage)
                .font(.system(size: 19, weight: .regular))
                .foregroundStyle(isSelected ? HausPlatformColor.accent : HausPlatformColor.label)
        }
    }
}
#endif
