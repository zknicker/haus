@testable import HausUI
import XCTest

/// The offer rule decides, from the date, the icon, and what this device has
/// already seen, whether to suggest a seasonal icon. It must ask at most once
/// a season and never nag a pumpkin the user picked in Settings.
final class SeasonalIconOfferTests: XCTestCase {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/New_York")!
        return calendar
    }

    func testOctoberOnTheGhostOffersThePumpkin() {
        XCTAssertEqual(offer(2026, 10, 16, .ghost), .halloween(season: 2026))
        XCTAssertEqual(offer(2026, 10, 1, .ghost), .halloween(season: 2026))
        XCTAssertEqual(offer(2026, 10, 31, .ghost), .halloween(season: 2026))
    }

    func testOctoberOnThePumpkinOffersNothing() {
        XCTAssertNil(offer(2026, 10, 16, .pumpkin))
    }

    func testAShownHalloweenOfferDoesNotRepeat() {
        let records = SeasonalIconRecords(halloweenOffersShown: [2026])
        XCTAssertNil(offer(2026, 10, 20, .ghost, records))
    }

    func testNovemberOnAnOfferPumpkinOffersTheGhostBack() {
        let records = SeasonalIconRecords(halloweenOffersShown: [2026], pumpkinFromOfferSeason: 2026)
        XCTAssertEqual(offer(2026, 11, 1, .pumpkin, records), .halloweenReturn(season: 2026))
    }

    func testAManuallyChosenPumpkinIsNeverNagged() {
        let records = SeasonalIconRecords(halloweenOffersShown: [2026])
        XCTAssertNil(offer(2026, 11, 1, .pumpkin, records))
        XCTAssertNil(offer(2026, 11, 1, .pumpkin))
    }

    func testAShownReturnOfferDoesNotRepeat() {
        let records = SeasonalIconRecords(returnOffersShown: [2026], pumpkinFromOfferSeason: 2026)
        XCTAssertNil(offer(2026, 12, 1, .pumpkin, records))
    }

    func testOtherMonthsOnTheGhostOfferNothing() {
        for month in [1, 2, 3, 4, 5, 6, 7, 8, 9] {
            XCTAssertNil(offer(2026, month, 15, .ghost), "month \(month)")
        }
        XCTAssertNil(offer(2026, 11, 1, .ghost))
        XCTAssertNil(offer(2026, 11, 5, .ghost))
    }

    func testTheReturnOfferCarriesIntoTheNewYear() {
        let records = SeasonalIconRecords(halloweenOffersShown: [2026], pumpkinFromOfferSeason: 2026)
        XCTAssertEqual(offer(2027, 1, 10, .pumpkin, records), .halloweenReturn(season: 2026))
        XCTAssertEqual(offer(2027, 9, 30, .pumpkin, records), .halloweenReturn(season: 2026))
    }

    func testAPumpkinKeptFromLastSeasonIsNotOfferedBackNextSeason() {
        let records = SeasonalIconRecords(
            halloweenOffersShown: [2026],
            returnOffersShown: [2026],
            pumpkinFromOfferSeason: 2026
        )
        XCTAssertNil(offer(2027, 10, 16, .pumpkin, records))
        XCTAssertNil(offer(2027, 11, 1, .pumpkin, records))
    }

    func testNextOctoberOffersAgainAfterLastYearsOffer() {
        let records = SeasonalIconRecords(halloweenOffersShown: [2026], returnOffersShown: [2026])
        XCTAssertEqual(offer(2027, 10, 1, .ghost, records), .halloween(season: 2027))
    }

    func testOctoberIsReadOnTheLocalCalendar() {
        // 03:30 UTC on 1 November is still 31 October in New York.
        let date = Date(timeIntervalSince1970: 1_793_503_800)
        let offer = SeasonalIconOffer.eligible(
            on: date,
            calendar: calendar,
            currentIcon: .ghost,
            records: SeasonalIconRecords()
        )
        XCTAssertEqual(offer, .halloween(season: 2026))
    }

    func testRecordingAShownOfferKeysItBySeason() {
        var records = SeasonalIconRecords()
        records.recordShown(.halloween(season: 2026))
        records.recordShown(.halloweenReturn(season: 2026))
        records.recordShown(.christmas(season: 2026))
        records.recordShown(.christmasReturn(season: 2026))
        XCTAssertEqual(records.halloweenOffersShown, [2026])
        XCTAssertEqual(records.returnOffersShown, [2026])
        XCTAssertEqual(records.christmasOffersShown, [2026])
        XCTAssertEqual(records.christmasReturnOffersShown, [2026])
    }

    func testOffersSuggestTheOtherIcon() {
        XCTAssertEqual(SeasonalIconOffer.halloween(season: 2026).suggestedIcon, .pumpkin)
        XCTAssertEqual(SeasonalIconOffer.halloweenReturn(season: 2026).suggestedIcon, .ghost)
        XCTAssertEqual(SeasonalIconOffer.christmas(season: 2026).suggestedIcon, .nightcap)
        XCTAssertEqual(SeasonalIconOffer.christmasReturn(season: 2026).suggestedIcon, .ghost)
    }

    // MARK: Christmas

    func testFromSixNovemberTheGhostIsOfferedTheNightcap() {
        XCTAssertEqual(offer(2026, 11, 6, .ghost), .christmas(season: 2026))
        XCTAssertEqual(offer(2026, 11, 30, .ghost), .christmas(season: 2026))
        XCTAssertEqual(offer(2026, 12, 1, .ghost), .christmas(season: 2026))
        XCTAssertEqual(offer(2026, 12, 24, .ghost), .christmas(season: 2026))
        XCTAssertEqual(offer(2026, 12, 31, .ghost), .christmas(season: 2026))
    }

    func testDecemberOnASeasonalIconOffersNoNightcap() {
        XCTAssertNil(offer(2026, 12, 24, .nightcap))
        XCTAssertNil(offer(2026, 12, 24, .pumpkin))
    }

    func testAShownChristmasOfferDoesNotRepeat() {
        let records = SeasonalIconRecords(christmasOffersShown: [2026])
        XCTAssertNil(offer(2026, 12, 26, .ghost, records))
    }

    func testAShownHalloweenOfferDoesNotSilenceChristmas() {
        let records = SeasonalIconRecords(halloweenOffersShown: [2026], returnOffersShown: [2026])
        XCTAssertEqual(offer(2026, 12, 1, .ghost, records), .christmas(season: 2026))
    }

    func testJanuaryOnAnOfferNightcapOffersTheGhostBack() {
        let records = SeasonalIconRecords(christmasOffersShown: [2026], nightcapFromOfferSeason: 2026)
        XCTAssertEqual(offer(2027, 1, 2, .nightcap, records), .christmasReturn(season: 2026))
        XCTAssertEqual(offer(2027, 6, 1, .nightcap, records), .christmasReturn(season: 2026))
    }

    func testTheNightcapIsNotOfferedBackBeforeJanuary() {
        let records = SeasonalIconRecords(christmasOffersShown: [2026], nightcapFromOfferSeason: 2026)
        XCTAssertNil(offer(2026, 11, 6, .nightcap, records))
        XCTAssertNil(offer(2026, 12, 31, .nightcap, records))
    }

    func testAManuallyChosenNightcapIsNeverNagged() {
        let records = SeasonalIconRecords(christmasOffersShown: [2026])
        XCTAssertNil(offer(2027, 1, 2, .nightcap, records))
        XCTAssertNil(offer(2027, 1, 2, .nightcap))
    }

    func testAShownChristmasReturnOfferDoesNotRepeat() {
        let records = SeasonalIconRecords(
            christmasReturnOffersShown: [2026],
            nightcapFromOfferSeason: 2026
        )
        XCTAssertNil(offer(2027, 2, 1, .nightcap, records))
    }

    func testANightcapKeptFromLastSeasonIsNotOfferedBackNextSeason() {
        let records = SeasonalIconRecords(christmasOffersShown: [2026], nightcapFromOfferSeason: 2026)
        XCTAssertNil(offer(2028, 1, 2, .nightcap, records))
    }

    func testNextDecemberOffersAgainAfterLastYearsOffer() {
        let records = SeasonalIconRecords(christmasOffersShown: [2026], christmasReturnOffersShown: [2026])
        XCTAssertEqual(offer(2027, 11, 6, .ghost, records), .christmas(season: 2027))
    }

    func testDecemberIsReadOnTheLocalCalendar() {
        // 03:30 UTC on 1 January 2027 is still 31 December in New York.
        let date = Date(timeIntervalSince1970: 1_798_774_200)
        let offer = SeasonalIconOffer.eligible(
            on: date,
            calendar: calendar,
            currentIcon: .ghost,
            records: SeasonalIconRecords()
        )
        XCTAssertEqual(offer, .christmas(season: 2026))
    }

    // MARK: Switching

    func testAnAcceptedOfferRemembersWhichSeasonPutTheIconOn() {
        var records = SeasonalIconRecords()
        records.recordSwitch(.halloween(season: 2026))
        XCTAssertEqual(records.pumpkinFromOfferSeason, 2026)
        XCTAssertNil(records.nightcapFromOfferSeason)

        records.recordSwitch(.halloweenReturn(season: 2026))
        XCTAssertNil(records.pumpkinFromOfferSeason)

        records.recordSwitch(.christmas(season: 2026))
        XCTAssertEqual(records.nightcapFromOfferSeason, 2026)
        XCTAssertNil(records.pumpkinFromOfferSeason)

        records.recordSwitch(.christmasReturn(season: 2026))
        XCTAssertNil(records.nightcapFromOfferSeason)
    }

    func testTheSeasonsHandOffThroughTheYear() {
        var records = SeasonalIconRecords()
        var icon = AppIconChoice.ghost
        // Accept every offer, the way a festive device would.
        for (year, month) in [(2026, 10), (2026, 11), (2026, 12), (2027, 1)] {
            guard let next = offer(year, month, 15, icon, records) else {
                return XCTFail("no offer in \(year)-\(month)")
            }
            records.recordShown(next)
            records.recordSwitch(next)
            icon = next.suggestedIcon
        }
        XCTAssertEqual(icon, .ghost)
        XCTAssertEqual(records.halloweenOffersShown, [2026])
        XCTAssertEqual(records.returnOffersShown, [2026])
        XCTAssertEqual(records.christmasOffersShown, [2026])
        XCTAssertEqual(records.christmasReturnOffersShown, [2026])
    }

    func testOfferCopy() {
        let halloween = SeasonalIconOfferCopy(.halloween(season: 2026))
        XCTAssertEqual(halloween.title, "Happy Halloween!")
        XCTAssertEqual(halloween.body, "It's spooky season. Let's get festive with a pumpkin icon.")
        XCTAssertEqual(halloween.accept, "Switch to Pumpkin")
        XCTAssertEqual(halloween.decline, "Keep Ghost")

        let goodbye = SeasonalIconOfferCopy(.halloweenReturn(season: 2026))
        XCTAssertEqual(goodbye.title, "Same time next year?")
        XCTAssertEqual(goodbye.body, "The pumpkin's heading back to the patch. Bring back the ghost?")
        XCTAssertEqual(goodbye.accept, "Bring Back Ghost")
        XCTAssertEqual(goodbye.decline, "Keep Pumpkin")

        let christmas = SeasonalIconOfferCopy(.christmas(season: 2026))
        XCTAssertEqual(christmas.title, "Merry Christmas!")
        XCTAssertEqual(christmas.body, "Deck the Home Screen with a nightcap ghost.")
        XCTAssertEqual(christmas.accept, "Switch to Nightcap")
        XCTAssertEqual(christmas.decline, "Keep Ghost")

        let packUp = SeasonalIconOfferCopy(.christmasReturn(season: 2026))
        XCTAssertEqual(packUp.title, "Packing up the decorations")
        XCTAssertEqual(packUp.body, "The nightcap goes back in the box. Bring back the ghost?")
        XCTAssertEqual(packUp.accept, "Bring Back Ghost")
        XCTAssertEqual(packUp.decline, "Keep Nightcap")
    }

    private func offer(
        _ year: Int,
        _ month: Int,
        _ day: Int,
        _ icon: AppIconChoice,
        _ records: SeasonalIconRecords = SeasonalIconRecords()
    ) -> SeasonalIconOffer? {
        let date = calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12))!
        return SeasonalIconOffer.eligible(on: date, calendar: calendar, currentIcon: icon, records: records)
    }
}
