namespace GeiRanking.Domain.Admin;

/// <summary>The club administrator. There is a single role, so being in this table is what makes someone an admin.</summary>
public class AdminUser
{
    public int Id { get; set; }

    /// <summary>Lowercase, trimmed. Login is case-insensitive.</summary>
    public required string Username { get; set; }

    public required string PasswordHash { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public static string NormalizeUsername(string username) => username.Trim().ToLowerInvariant();
}
