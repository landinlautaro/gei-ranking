namespace GeiRanking.Domain.Ranking;

/// <summary>
/// Something that changes the ladder. Events are replayed ordered by <see cref="OccurredAt"/>,
/// then <see cref="CreatedAt"/>, then <see cref="Id"/>.
/// </summary>
public abstract record RankingEvent(long Id, DateTimeOffset OccurredAt, DateTimeOffset CreatedAt);

/// <summary>Starting order, first id is position 1.</summary>
public sealed record InitialRanking(long Id, DateTimeOffset OccurredAt, DateTimeOffset CreatedAt, IReadOnlyList<int> PlayerIds)
    : RankingEvent(Id, OccurredAt, CreatedAt);

/// <summary>
/// A match that moves the ladder. Walkovers and retirements are the same event: the completion type does not change the movement.
/// Voided matches stay in the event list but are skipped by the replay.
/// </summary>
public sealed record MatchPlayed(
    long Id,
    DateTimeOffset OccurredAt,
    DateTimeOffset CreatedAt,
    int MatchId,
    int ChallengerId,
    int ChallengedId,
    int WinnerId,
    bool IsVoided = false) : RankingEvent(Id, OccurredAt, CreatedAt);

/// <summary>New player at the end of the ladder, or at <paramref name="Position"/> when given.</summary>
public sealed record PlayerAdded(long Id, DateTimeOffset OccurredAt, DateTimeOffset CreatedAt, int PlayerId, int? Position = null)
    : RankingEvent(Id, OccurredAt, CreatedAt);

/// <summary>The player leaves the ladder and everyone below moves up one place.</summary>
public sealed record PlayerRemoved(long Id, DateTimeOffset OccurredAt, DateTimeOffset CreatedAt, int PlayerId)
    : RankingEvent(Id, OccurredAt, CreatedAt);

/// <summary>The admin moves a player to <paramref name="NewPosition"/>; the others shift.</summary>
public sealed record ManualAdjustment(
    long Id,
    DateTimeOffset OccurredAt,
    DateTimeOffset CreatedAt,
    int PlayerId,
    int NewPosition,
    string Reason) : RankingEvent(Id, OccurredAt, CreatedAt);
