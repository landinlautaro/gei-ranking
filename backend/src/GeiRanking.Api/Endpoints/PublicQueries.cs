using GeiRanking.Api.Dtos;
using GeiRanking.Domain.Challenges;
using GeiRanking.Domain.Matches;
using GeiRanking.Domain.Ranking;
using GeiRanking.Domain.Stats;
using GeiRanking.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace GeiRanking.Api.Endpoints;

/// <summary>Read helpers shared by the public endpoints. The ranking tables are small (~70 players), so they are loaded whole.</summary>
internal static class PublicQueries
{
    public static async Task<Dictionary<int, PlayerRefDto>> LoadPlayerRefs(AppDbContext db, CancellationToken ct) =>
        await db.Players.AsNoTracking()
            .ToDictionaryAsync(p => p.Id, p => new PlayerRefDto(p.Id, p.FullName, p.Nickname, p.PhotoPath), ct);

    /// <summary>Position changes grouped by player, in application order.</summary>
    public static async Task<ILookup<int, PositionChange>> LoadHistory(AppDbContext db, CancellationToken ct)
    {
        var rows = await db.RankingHistory.AsNoTracking().OrderBy(h => h.Id).ToListAsync(ct);
        return rows.ToLookup(h => h.PlayerId, h => new PositionChange(h.EventId, h.OccurredAt, h.PlayerId, h.FromPosition, h.ToPosition));
    }

    /// <summary>Stats from all valid matches in chronological order.</summary>
    public static async Task<Dictionary<int, PlayerStats>> LoadStats(AppDbContext db, CancellationToken ct)
    {
        var results = await db.Matches.AsNoTracking()
            .Where(m => m.Status == MatchStatus.Valid)
            .OrderBy(m => m.PlayedAt).ThenBy(m => m.Id)
            .Select(m => new MatchResult(m.ChallengerId, m.ChallengedId, m.WinnerId))
            .ToListAsync(ct);
        return StatsCalculator.Compute(results);
    }

    public static RankingRowDto ToRankingRow(
        int position,
        PlayerRefDto player,
        IReadOnlyDictionary<int, PlayerStats> stats,
        ILookup<int, PositionChange> history)
    {
        var s = stats.GetValueOrDefault(player.Id, PlayerStats.Empty);
        var summary = StatsCalculator.SummarizePositions(history[player.Id].ToList(), position);
        return new RankingRowDto(position, player, s.Played, s.Wins, s.Losses, s.ChallengesWon, s.ChallengesLost,
            summary.PreviousPosition, summary.Movement);
    }

    /// <summary>Open challenges (pending or agreed), expired ones included, soonest deadline first. Optionally only those of one player.</summary>
    public static async Task<List<PublicChallengeDto>> LoadActiveChallenges(
        AppDbContext db, TimeProvider clock, int? playerId, CancellationToken ct)
    {
        var query = db.Challenges.AsNoTracking().Where(c => c.Status == ChallengeStatus.Pending || c.Status == ChallengeStatus.Scheduled);
        if (playerId is { } pid)
        {
            query = query.Where(c => c.ChallengerId == pid || c.ChallengedId == pid);
        }

        var challenges = await query.OrderBy(c => c.DeadlineAt).ThenBy(c => c.Id).ToListAsync(ct);
        return await ToChallengeDtos(db, clock, challenges, ct);
    }

    public static async Task<List<PublicChallengeDto>> ToChallengeDtos(
        AppDbContext db, TimeProvider clock, IReadOnlyList<Challenge> challenges, CancellationToken ct)
    {
        if (challenges.Count == 0)
        {
            return [];
        }

        var now = clock.GetUtcNow();
        var players = await LoadPlayerRefs(db, ct);
        var positions = await db.RankingSnapshot.AsNoTracking().ToDictionaryAsync(s => s.PlayerId, s => s.Position, ct);

        return challenges.Select(c => new PublicChallengeDto(
            c.Id, players[c.ChallengerId], players[c.ChallengedId],
            positions.TryGetValue(c.ChallengerId, out var cp) ? cp : null,
            positions.TryGetValue(c.ChallengedId, out var dp) ? dp : null,
            c.IssuedAt, c.DeadlineAt, c.Status, c.IsExpired(now), c.ScheduledAt, c.MatchId)).ToList();
    }

    public static MatchDto ToMatchDto(Match m, IReadOnlyDictionary<int, PlayerRefDto> players) => new(
        m.Id, m.PlayedAt, players[m.ChallengerId], players[m.ChallengedId], players[m.WinnerId],
        m.FormatResult(), m.Score, m.Completion,
        m.ChallengerPositionBefore, m.ChallengerPositionAfter, m.ChallengedPositionBefore, m.ChallengedPositionAfter,
        m.MovementText, m.Notes);
}
