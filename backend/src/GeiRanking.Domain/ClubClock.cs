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

    /// <summary>Last millisecond of the given club-local calendar day, as a UTC instant.</summary>
    public static DateTimeOffset EndOfDayUtc(DateOnly day) => StartOfDayUtc(day.AddDays(1)).AddMilliseconds(-1);

    /// <summary>Club-local calendar day of a UTC instant.</summary>
    public static DateOnly ToClubDate(DateTimeOffset utc) => DateOnly.FromDateTime(ToClubTime(utc).DateTime);

    /// <summary>Monday of the club-local week (Monday to Sunday) the instant falls in.</summary>
    public static DateOnly WeekStart(DateTimeOffset utc)
    {
        var day = ToClubDate(utc);
        return day.AddDays(-(((int)day.DayOfWeek + 6) % 7));
    }

    /// <summary>Formats as dd/MM/yyyy in club local time.</summary>
    public static string FormatDate(DateTimeOffset utc) => ToClubTime(utc).ToString("dd/MM/yyyy");
}
