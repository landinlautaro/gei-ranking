namespace GeiRanking.Domain.Challenges;

/// <summary>Stored state of a challenge. "Expired" is not here: it is derived from the deadline, see <see cref="Challenge.IsExpired"/>.</summary>
public enum ChallengeStatus
{
    Pending,
    Scheduled,
    Played,
    Cancelled,
}

/// <summary>
/// A challenge announced in the group. It is not a ranking event: the ranking only moves when the match is loaded,
/// and the challenge is then linked to it.
/// </summary>
public class Challenge
{
    public int Id { get; set; }

    public int ChallengerId { get; set; }

    public int ChallengedId { get; set; }

    public DateTimeOffset IssuedAt { get; set; }

    /// <summary>Stored at creation so a later change of the rule does not move old challenges.</summary>
    public DateTimeOffset DeadlineAt { get; set; }

    public ChallengeStatus Status { get; set; } = ChallengeStatus.Pending;

    /// <summary>Date and time the players agreed on, if they did.</summary>
    public DateTimeOffset? ScheduledAt { get; set; }

    public int? MatchId { get; set; }

    public string? Notes { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public bool IsActive => Status is ChallengeStatus.Pending or ChallengeStatus.Scheduled;

    /// <summary>Active and past its deadline. Nothing happens automatically: the admin decides.</summary>
    public bool IsExpired(DateTimeOffset now) => IsActive && now > DeadlineAt;
}
