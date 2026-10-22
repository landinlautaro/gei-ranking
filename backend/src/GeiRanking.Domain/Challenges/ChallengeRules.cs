namespace GeiRanking.Domain.Challenges;

/// <summary>Weekly challenge cycle of the rules (version 2), kept in one place so it is easy to change.</summary>
public sealed record ChallengeRules(DayOfWeek LastDayToChallenge = DayOfWeek.Wednesday)
{
    public static readonly ChallengeRules Default = new();

    /// <summary>Sunday 23:59:59.999 (club time) of the week the challenge was made.</summary>
    public DateTimeOffset DeadlineFor(DateTimeOffset issuedAt) => ClubClock.EndOfDayUtc(ClubClock.WeekStart(issuedAt).AddDays(6));

    /// <summary>Challenges can be made from Monday up to <see cref="LastDayToChallenge"/> inclusive.</summary>
    public bool IsWithinChallengeWindow(DateTimeOffset issuedAt)
    {
        var offset = ClubClock.ToClubDate(issuedAt).DayNumber - ClubClock.WeekStart(issuedAt).DayNumber;
        return offset <= ((int)LastDayToChallenge + 6) % 7;
    }

    /// <summary>Whether two instants fall in the same Monday-to-Sunday club week.</summary>
    public static bool SameWeek(DateTimeOffset a, DateTimeOffset b) => ClubClock.WeekStart(a) == ClubClock.WeekStart(b);
}
