namespace GeiRanking.Domain;

/// <summary>Club time zone helpers. All timestamps are stored in UTC and shown in club local time.</summary>
public static class ClubClock
{
    public const string TimeZoneId = "America/Argentina/Buenos_Aires";

    private static readonly TimeZoneInfo Zone = TimeZoneInfo.FindSystemTimeZoneById(TimeZoneId);

    public static DateTimeOffset ToClubTime(DateTimeOffset utc) => TimeZoneInfo.ConvertTime(utc, Zone);

    /// <summary>UTC instant at which the given club-local calendar day starts.</summary>
    public static DateTimeOffset StartOfDayUtc(DateOnly day)
    {
        var local = day.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(local, Zone.GetUtcOffset(local)).ToUniversalTime();
    }

    /// <summary>Formats as dd/MM/yyyy in club local time.</summary>
    public static string FormatDate(DateTimeOffset utc) => ToClubTime(utc).ToString("dd/MM/yyyy");
}
