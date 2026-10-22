using GeiRanking.Domain.Challenges;

namespace GeiRanking.Domain.Tests;

public class ChallengeRulesTests
{
    private static readonly ChallengeRules Rules = ChallengeRules.Default;

    // Buenos Aires is UTC-3 all year. 2026-10-19 is a Monday.
    private static DateTimeOffset Club(int day, int hour, int minute = 0) =>
        new DateTimeOffset(2026, 10, day, hour, minute, 0, TimeSpan.FromHours(-3)).ToUniversalTime();

    [Theory]
    [InlineData(19, 0)] // Monday 00:00
    [InlineData(21, 12)] // Wednesday
    [InlineData(25, 23)] // Sunday 23:00
    public void Deadline_IsSundayEndOfDay_OfTheSameWeek(int day, int hour)
    {
        var deadline = Rules.DeadlineFor(Club(day, hour));

        Assert.Equal(Club(25, 23, 59).AddSeconds(59).AddMilliseconds(999), deadline);
    }

    [Fact]
    public void Deadline_OfTheNextMondayMidnight_IsTheFollowingSunday()
    {
        var deadline = Rules.DeadlineFor(Club(26, 0));

        var sundayNov1 = new DateTimeOffset(2026, 11, 1, 23, 59, 59, 999, TimeSpan.FromHours(-3));
        Assert.Equal(sundayNov1.ToUniversalTime(), deadline);
    }

    [Fact]
    public void Deadline_UsesClubDay_NotUtcDay()
    {
        // Sunday 22:00 in Buenos Aires is already Monday in UTC, but still belongs to that week.
        var sundayNight = Club(25, 22);

        Assert.Equal(Club(25, 23, 59).AddSeconds(59).AddMilliseconds(999), Rules.DeadlineFor(sundayNight));
    }

    [Theory]
    [InlineData(19, 0, true)] // Monday
    [InlineData(21, 23, true)] // Wednesday night, still inclusive
    [InlineData(22, 0, false)] // Thursday
    [InlineData(25, 12, false)] // Sunday
    [InlineData(26, 0, true)] // next Monday
    public void Window_IsMondayToWednesday(int day, int hour, bool expected) =>
        Assert.Equal(expected, Rules.IsWithinChallengeWindow(Club(day, hour)));

    [Fact]
    public void IsExpired_OnlyForActiveChallengesPastTheDeadline()
    {
        var deadline = Rules.DeadlineFor(Club(20, 10));
        var challenge = new Challenge { DeadlineAt = deadline };

        Assert.False(challenge.IsExpired(deadline));
        Assert.True(challenge.IsExpired(deadline.AddMilliseconds(1)));

        challenge.Status = ChallengeStatus.Scheduled;
        Assert.True(challenge.IsExpired(deadline.AddDays(1)));

        challenge.Status = ChallengeStatus.Played;
        Assert.False(challenge.IsExpired(deadline.AddDays(1)));

        challenge.Status = ChallengeStatus.Cancelled;
        Assert.False(challenge.IsExpired(deadline.AddDays(1)));
    }
}
