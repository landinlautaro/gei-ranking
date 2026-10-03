using GeiRanking.Domain.Matches;
using GeiRanking.Domain.Players;

namespace GeiRanking.Infrastructure.Persistence;

public enum RankingEventKind
{
    InitialRanking,
    MatchPlayed,
    PlayerAdded,
    PlayerRemoved,
    ManualAdjustment,
}

/// <summary>
/// Row of the append-only event log the ranking is derived from. Only the columns of its <see cref="Kind"/> are used.
/// A <see cref="RankingEventKind.MatchPlayed"/> event points to its match, which is the single source of truth for
/// challenger, challenged, winner, date and voided state.
/// </summary>
public class StoredRankingEvent
{
    public long Id { get; set; }

    public RankingEventKind Kind { get; set; }

    public DateTimeOffset OccurredAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public int? MatchId { get; set; }

    public Match? Match { get; set; }

    public int? PlayerId { get; set; }

    public Player? Player { get; set; }

    /// <summary>PlayerAdded: requested position (null = last). ManualAdjustment: target position.</summary>
    public int? Position { get; set; }

    public string? Reason { get; set; }

    /// <summary>InitialRanking only: player ids, first one is position 1.</summary>
    public int[]? InitialOrder { get; set; }
}

/// <summary>Current ranking, regenerated from the events. One row per ranked player.</summary>
public class RankingSnapshotEntry
{
    public int Position { get; set; }

    public int PlayerId { get; set; }

    public Player? Player { get; set; }
}

/// <summary>Position change of a player caused by an event, regenerated from the events.</summary>
public class RankingHistoryEntry
{
    public long Id { get; set; }

    public long EventId { get; set; }

    public int PlayerId { get; set; }

    public DateTimeOffset OccurredAt { get; set; }

    public int? FromPosition { get; set; }

    public int? ToPosition { get; set; }
}
