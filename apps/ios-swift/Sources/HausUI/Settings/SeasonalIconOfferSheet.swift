import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

public extension View {
    /// Offers the season's app icon once the authenticated app is up. Apply it
    /// only to the main UI, never to onboarding or sign-in.
    func seasonalIconOffer() -> some View {
        modifier(SeasonalIconOfferPresenter())
    }
}

/// Checks each time the app becomes active, after the opening entrance has
/// settled, and stands down while anything else is presented: the offer
/// never stacks on another sheet and simply waits for a later activation.
private struct SeasonalIconOfferPresenter: ViewModifier {
    static let settleDelay: Duration = .seconds(1.5)

    @Environment(\.scenePhase) private var scenePhase
    @State private var offer: SeasonalIconOffer?
    @State private var accepted: SeasonalIconOffer?

    func body(content: Content) -> some View {
        content
            .task(id: scenePhase) {
                guard scenePhase == .active else { return }
                try? await Task.sleep(for: Self.settleDelay)
                guard !Task.isCancelled else { return }
                presentIfEligible()
            }
            .sheet(item: $offer, onDismiss: switchIfAccepted) { offer in
                SeasonalIconOfferSheet(offer: offer) {
                    accepted = offer
                    self.offer = nil
                }
            }
    }

    private func presentIfEligible() {
        guard offer == nil, !isPresentingElsewhere else { return }
        // Read the date first: in Debug it applies `-HausSeasonReset` to the records.
        let date = SeasonalIconOfferStore.now()
        var records = SeasonalIconOfferStore.load()
        guard let next = SeasonalIconOffer.eligible(
            on: date,
            calendar: .current,
            currentIcon: AppIconSwitcher.current,
            records: records
        ) else { return }
        records.recordShown(next)
        SeasonalIconOfferStore.save(records)
        offer = next
    }

    /// Switches after the sheet is gone, so iOS's own icon-changed alert
    /// lands on the app rather than on a dismissing sheet.
    private func switchIfAccepted() {
        guard let accepted else { return }
        self.accepted = nil
        Task {
            let shown = await AppIconSwitcher.set(accepted.suggestedIcon)
            guard shown == accepted.suggestedIcon else { return }
            var records = SeasonalIconOfferStore.load()
            records.pumpkinFromOfferSeason = shown == .pumpkin ? accepted.season : nil
            SeasonalIconOfferStore.save(records)
        }
    }

    private var isPresentingElsewhere: Bool {
        #if canImport(UIKit)
        let root = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }?
            .keyWindow?
            .rootViewController
        return root?.presentedViewController != nil
        #else
        false
        #endif
    }
}

extension SeasonalIconOffer: Identifiable {
    public var id: String {
        switch self {
        case .halloween(let season): "halloween-\(season)"
        case .halloweenReturn(let season): "halloween-return-\(season)"
        }
    }
}

struct SeasonalIconOfferSheet: View {
    let offer: SeasonalIconOffer
    let onAccept: () -> Void

    @Environment(\.dismiss) private var dismiss
    @ScaledMetric(relativeTo: .largeTitle) private var previewSize: CGFloat = 128

    var body: some View {
        VStack(spacing: 20) {
            AppIconPreview(icon: offer.suggestedIcon)
                .frame(width: previewSize, height: previewSize)
            VStack(spacing: 8) {
                Text(copy.title)
                    .font(.title2.bold())
                    .accessibilityAddTraits(.isHeader)
                Text(copy.body)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
            .multilineTextAlignment(.center)
            VStack(spacing: 4) {
                Button(action: onAccept) {
                    Text(copy.accept).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                Button { dismiss() } label: {
                    Text(copy.decline).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderless)
            }
            .controlSize(.large)
        }
        .padding(.horizontal, 24)
        .padding(.top, 32)
        .frame(maxHeight: .infinity, alignment: .top)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    private var copy: SeasonalIconOfferCopy { SeasonalIconOfferCopy(offer) }
}

struct SeasonalIconOfferCopy: Equatable {
    let title: String
    let body: String
    let accept: String
    let decline: String

    init(_ offer: SeasonalIconOffer) {
        switch offer {
        case .halloween:
            title = "Happy Halloween!"
            body = "It's spooky season. Let's get festive with a pumpkin icon."
            accept = "Switch to Pumpkin"
            decline = "Keep Ghost"
        case .halloweenReturn:
            title = "Same time next year?"
            body = "The pumpkin's heading back to the patch. Bring back the ghost?"
            accept = "Bring Back Ghost"
            decline = "Keep Pumpkin"
        }
    }
}

/// A static render of a Home Screen icon. App icons in the catalog cannot be
/// loaded as images, so HausUI bundles Icon Composer renders of each choice.
private struct AppIconPreview: View {
    let icon: AppIconChoice

    var body: some View {
        Group {
            #if canImport(UIKit)
            if let image = UIImage(named: "app-icon-preview-\(icon.rawValue)", in: .module, with: nil) {
                Image(uiImage: image).resizable().scaledToFit()
            }
            #endif
        }
        .accessibilityElement()
        .accessibilityLabel("\(icon.title) app icon")
    }
}
