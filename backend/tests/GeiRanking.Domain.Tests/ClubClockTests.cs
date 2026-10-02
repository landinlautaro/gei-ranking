using GeiRanking.Domain;

namespace GeiRanking.Domain.Tests;

public class ClubClockTests
{
    [Fact]
    public void FormatDate_UsesClubTimeZone()
    {
        // 01:30 UTC on 11/03 is still 10/03 at 22:30 in Buenos Aires (UTC-3).
        var utc = new DateTimeOffset(2026, 3, 11, 1, 30, 0, TimeSpan.Zero);

        Assert.Equal("10/03/2026", ClubClock.FormatDate(utc));
    }
}
