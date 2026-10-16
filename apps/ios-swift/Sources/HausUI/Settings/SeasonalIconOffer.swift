import Foundation

/// A once-a-season suggestion to change the Home Screen icon. The icon itself
/// stays manual: an offer only asks, and Settings > App icon always works.
///
/// A season is named by the year of its October, so the return offer in
/// January 2027 belongs to the 2026 season.
public enum SeasonalIconOffer: Equatable, Sendable {
    /// October, still on the ghost: offer the pumpkin.
    case halloween(season: Int)
    /// After October, on a pumpkin this season's offer chose: offer the ghost back.
    case halloweenReturn(season: Int)

    public var season: Int {
        switch self {
        case .halloween(let season), .halloweenReturn(let season): season
        }
    }

    /// The icon the primary button switches to.
    public var suggestedIcon: AppIconChoice {
        switch self {
        case .halloween: .pumpkin
        case .halloweenReturn: .ghost
        }
    }

    /// The offer this device should see now, if any.
    public static func eligible(
        on date: Date,
        calendar: Calendar,
        currentIcon: AppIconChoice,
        records: SeasonalIconRecords
    ) -> SeasonalIconOffer? {
        let parts = calendar.dateComponents([.year, .month], from: date)
        guard let year = parts.year, let month = parts.month else { return nil }
        if month == halloweenMonth {
            guard currentIcon == .ghost, !records.halloweenOffersShown.contains(year) else { return nil }
            return .halloween(season: year)
        }
        let season = month > halloweenMonth ? year : year - 1
        // A pumpkin picked in Settings, or kept from an earlier season, is the
        // user's own choice and never earns a nudge back.
        guard currentIcon == .pumpkin,
              records.pumpkinFromOfferSeason == season,
              !records.returnOffersShown.contains(season)
        else { return nil }
        return .halloweenReturn(season: season)
    }

    private static let halloweenMonth = 10
}

/// What this device remembers about seasonal offers. Showing an offer records
/// it whatever the answer, so declining is final for that season.
public struct SeasonalIconRecords: Equatable, Sendable {
    public var halloweenOffersShown: Set<Int>
    public var returnOffersShown: Set<Int>
    /// The season whose Halloween offer switched this device to the pumpkin.
    /// Any switch from Settings clears it.
    public var pumpkinFromOfferSeason: Int?

    public init(
        halloweenOffersShown: Set<Int> = [],
        returnOffersShown: Set<Int> = [],
        pumpkinFromOfferSeason: Int? = nil
    ) {
        self.halloweenOffersShown = halloweenOffersShown
        self.returnOffersShown = returnOffersShown
        self.pumpkinFromOfferSeason = pumpkinFromOfferSeason
    }

    public mutating func recordShown(_ offer: SeasonalIconOffer) {
        switch offer {
        case .halloween(let season): halloweenOffersShown.insert(season)
        case .halloweenReturn(let season): returnOffersShown.insert(season)
        }
    }
}
