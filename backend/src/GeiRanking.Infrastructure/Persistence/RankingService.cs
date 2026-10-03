using GeiRanking.Domain.Matches;
using GeiRanking.Domain.Ranking;
using Microsoft.EntityFrameworkCore;

namespace GeiRanking.Infrastructure.Persistence;

/// <summary>
/// Persists ranking changes and regenerates everything derived from the events (snapshot, history and the
/// per-match positions/movement/warning). A change and its recalculation always commit together.
/// </summary>
public class RankingService(AppDbContext db)
{
    /// <summary>
    /// Runs <paramref name="mutation"/> (add/edit/void matches, players, events; it must call SaveChanges),
    /// then rebuilds the ranking, all in one transaction: everything is applied or nothing is.
    /// </summary>
    public Task ExecuteAsync(Func<AppDbContext, CancellationToken, Task> mutation, CancellationToken ct = default)
    {
        // Required with EnableRetryOnFailure: the whole unit of work is the retriable operation.
        var strategy = db.Database.CreateExecutionStrategy();
        return strategy.ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await mutation(db, ct);
            await RebuildCoreAsync(ct);
            await tx.CommitAsync(ct);
        });
    }

    /// <summary>Regenerates snapshot, history and match-derived fields from the events.</summary>
    public Task RebuildAsync(CancellationToken ct = default) => ExecuteAsync((_, _) => Task.CompletedTask, ct);

    /// <summary>The persisted event log as domain events, read-only. Used to preview a change by replaying it in memory.</summary>
    public async Task<List<RankingEvent>> LoadDomainEventsAsync(CancellationToken ct = default)
    {
        var events = await db.RankingEvents.AsNoTracking().ToListAsync(ct);
        var matches = await db.Matches.AsNoTracking().ToDictionaryAsync(m => m.Id, ct);
        return events.Select(e => ToDomainEvent(e, matches)).ToList();
    }

    private async Task RebuildCoreAsync(CancellationToken ct)
    {
        var events = await db.RankingEvents.OrderBy(e => e.OccurredAt).ThenBy(e => e.CreatedAt).ThenBy(e => e.Id).ToListAsync(ct);
        var matches = await db.Matches.ToDictionaryAsync(m => m.Id, ct);
        var names = await db.Players.AsNoTracking().ToDictionaryAsync(p => p.Id, p => p.FullName, ct);

        // The match is the source of truth for its date: keep the stored event date in sync with it.
        foreach (var e in events.Where(e => e.Kind == RankingEventKind.MatchPlayed))
        {
            e.OccurredAt = matches[e.MatchId!.Value].PlayedAt;
        }

        var state = RankingEngine.Replay(events.Select(e => ToDomainEvent(e, matches)));

        foreach (var m in matches.Values)
        {
            if (m.Status == MatchStatus.Valid && state.Outcomes.TryGetValue(m.Id, out var outcome))
            {
                m.ChallengerPositionBefore = outcome.ChallengerPositionBefore;
                m.ChallengerPositionAfter = outcome.ChallengerPositionAfter;
                m.ChallengedPositionBefore = outcome.ChallengedPositionBefore;
                m.ChallengedPositionAfter = outcome.ChallengedPositionAfter;
                m.MovementText = outcome.Describe(id => names.GetValueOrDefault(id, $"#{id}"));
                m.Warning = outcome.Warning;
            }
            else
            {
                m.ChallengerPositionBefore = m.ChallengerPositionAfter = null;
                m.ChallengedPositionBefore = m.ChallengedPositionAfter = null;
                m.MovementText = null;
                m.Warning = null;
            }
        }

        await db.SaveChangesAsync(ct);

        await db.RankingHistory.ExecuteDeleteAsync(ct);
        await db.RankingSnapshot.ExecuteDeleteAsync(ct);

        db.RankingSnapshot.AddRange(state.Order.Select((playerId, i) => new RankingSnapshotEntry { Position = i + 1, PlayerId = playerId }));
        db.RankingHistory.AddRange(state.History.Select(h => new RankingHistoryEntry
        {
            EventId = h.EventId,
            PlayerId = h.PlayerId,
            OccurredAt = h.OccurredAt,
            FromPosition = h.FromPosition,
            ToPosition = h.ToPosition,
        }));
        await db.SaveChangesAsync(ct);
    }

    private static RankingEvent ToDomainEvent(StoredRankingEvent e, Dictionary<int, Match> matches) => e.Kind switch
    {
        RankingEventKind.InitialRanking => new InitialRanking(e.Id, e.OccurredAt, e.CreatedAt, e.InitialOrder ?? []),
        RankingEventKind.MatchPlayed => ToMatchPlayed(e, matches[e.MatchId!.Value]),
        RankingEventKind.PlayerAdded => new PlayerAdded(e.Id, e.OccurredAt, e.CreatedAt, e.PlayerId!.Value, e.Position),
        RankingEventKind.PlayerRemoved => new PlayerRemoved(e.Id, e.OccurredAt, e.CreatedAt, e.PlayerId!.Value),
        RankingEventKind.ManualAdjustment => new ManualAdjustment(
            e.Id, e.OccurredAt, e.CreatedAt, e.PlayerId!.Value, e.Position!.Value, e.Reason ?? string.Empty),
        _ => throw new InvalidOperationException($"Unknown ranking event kind '{e.Kind}'."),
    };

    private static MatchPlayed ToMatchPlayed(StoredRankingEvent e, Match m) => new(
        e.Id, m.PlayedAt, e.CreatedAt, m.Id, m.ChallengerId, m.ChallengedId, m.WinnerId, m.Status == MatchStatus.Voided);
}
