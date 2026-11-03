import Foundation

/// A once-a-season suggestion to change the Home Screen icon. The icon itself
/// stays manual: an offer only asks, and Settings > App icon always works.
///
/// A season is named by the year of its holiday month: Halloween's by its
/// October, Christmas's by its December, though the Christmas offer opens on
/// 6 November. The return offer in January 2027 belongs to the 2026 season of
/// either.
public enum SeasonalIconOffer: Equatable, Sendable {
    /// October, still on the ghost: offer the pumpkin.
    case halloween(season: Int)
    /// After October, on a pumpkin this season's offer chose: offer the ghost back.
    case halloweenReturn(season: Int)
    /// December, still on the ghost: offer the nightcap.
    case christmas(season: Int)
    /// After December, on a nightcap this season's offer chose: offer the ghost back.
    case christmasReturn(season: Int)

    public var season: Int {
        switch self {
        case .halloween(let season), .halloweenReturn(let season),
             .christmas(let season), .christmasReturn(let season):
            season
        }
    }

    /// The icon the primary button switches to.
    public var suggestedIcon: AppIconChoice {
        switch self {
        case .halloween: .pumpkin
        case .christmas: .nightcap
        case .halloweenReturn, .christmasReturn: .ghost
        }
    }

    /// The offer this device should see now, if any. Each holiday offers its
    /// icon only to the ghost and offers the ghost back only to its own icon,
    /// so at most one of them ever applies.
    public static func eligible(
        on date: Date,
        calendar: Calendar,
        currentIcon: AppIconChoice,
        records: SeasonalIconRecords
    ) -> SeasonalIconOffer? {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        guard let year = parts.year, let month = parts.month, let day = parts.day else { return nil }
        let christmasSeason = month == christmasMonth
            || (month == christmasOpensMonth && day >= christmasOpensDay)
        switch currentIcon {
        case .ghost:
            if month == halloweenMonth, !records.halloweenOffersShown.contains(year) {
                return .halloween(season: year)
            }
            if christmasSeason, !records.christmasOffersShown.contains(year) {
                return .christmas(season: year)
            }
            return nil
        // A seasonal icon picked in Settings, or kept from an earlier season,
        // is the user's own choice and never earns a nudge back.
        case .pumpkin:
            guard month != halloweenMonth else { return nil }
            let season = month > halloweenMonth ? year : year - 1
            guard records.pumpkinFromOfferSeason == season,
                  !records.returnOffersShown.contains(season)
            else { return nil }
            return .halloweenReturn(season: season)
        case .nightcap:
            guard !christmasSeason else { return nil }
            let season = year - 1
            guard records.nightcapFromOfferSeason == season,
                  !records.christmasReturnOffersShown.contains(season)
            else { return nil }
            return .christmasReturn(season: season)
        }
    }

    private static let halloweenMonth = 10
    private static let christmasMonth = 12
    private static let christmasOpensMonth = 11
    private static let christmasOpensDay = 6
}

/// What this device remembers about seasonal offers. Showing an offer records
/// it whatever the answer, so declining is final for that season.
public struct SeasonalIconRecords: Equatable, Sendable {
    public var halloweenOffersShown: Set<Int>
    public var returnOffersShown: Set<Int>
    /// The season whose Halloween offer switched this device to the pumpkin.
    /// Any switch from Settings clears it.
    public var pumpkinFromOfferSeason: Int?
    public var christmasOffersShown: Set<Int>
    public var christmasReturnOffersShown: Set<Int>
    /// The season whose Christmas offer switched this device to the nightcap.
    /// Any switch from Settings clears it.
    public var nightcapFromOfferSeason: Int?

    public init(
        halloweenOffersShown: Set<Int> = [],
        returnOffersShown: Set<Int> = [],
        pumpkinFromOfferSeason: Int? = nil,
        christmasOffersShown: Set<Int> = [],
        christmasReturnOffersShown: Set<Int> = [],
        nightcapFromOfferSeason: Int? = nil
    ) {
        self.halloweenOffersShown = halloweenOffersShown
        self.returnOffersShown = returnOffersShown
        self.pumpkinFromOfferSeason = pumpkinFromOfferSeason
        self.christmasOffersShown = christmasOffersShown
        self.christmasReturnOffersShown = christmasReturnOffersShown
        self.nightcapFromOfferSeason = nightcapFromOfferSeason
    }

    public mutating func recordShown(_ offer: SeasonalIconOffer) {
        switch offer {
        case .halloween(let season): halloweenOffersShown.insert(season)
        case .halloweenReturn(let season): returnOffersShown.insert(season)
        case .christmas(let season): christmasOffersShown.insert(season)
        case .christmasReturn(let season): christmasReturnOffersShown.insert(season)
        }
    }

    /// After an accepted offer switched the icon: remembers which season's
    /// offer put a seasonal icon on the Home Screen, so only that one is
    /// offered back, and forgets it once the ghost is back.
    public mutating func recordSwitch(_ offer: SeasonalIconOffer) {
        pumpkinFromOfferSeason = offer.suggestedIcon == .pumpkin ? offer.season : nil
        nightcapFromOfferSeason = offer.suggestedIcon == .nightcap ? offer.season : nil
    }
}
