namespace GeiRanking.Domain;

/// <summary>Club time zone helpers. All timestamps are stored in UTC and shown in club local time.</summary>
public static class ClubClock
{
    public const string TimeZoneId = "America/Argentina/Buenos_Aires";

    private static readonly TimeZoneInfo Zone = TimeZoneInfo.FindSystemTimeZoneById(TimeZoneId);

    public static DateTimeOffset ToClubTime(DateTimeOffset utc) => TimeZoneInfo.ConvertTime(utc, Zone);

    /// <summary>Formats as dd/MM/yyyy in club local time.</summary>
    public static string FormatDate(DateTimeOffset utc) => ToClubTime(utc).ToString("dd/MM/yyyy");
}
