using GeiRanking.Api.Dtos;
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

    public static MatchDto ToMatchDto(Match m, IReadOnlyDictionary<int, PlayerRefDto> players) => new(
        m.Id, m.PlayedAt, players[m.ChallengerId], players[m.ChallengedId], players[m.WinnerId],
        m.FormatResult(), m.Score, m.Completion,
        m.ChallengerPositionBefore, m.ChallengerPositionAfter, m.ChallengedPositionBefore, m.ChallengedPositionAfter,
        m.MovementText, m.Notes);
}
