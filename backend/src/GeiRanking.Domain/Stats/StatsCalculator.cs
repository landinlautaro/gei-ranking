using GeiRanking.Domain.Ranking;

namespace GeiRanking.Domain.Stats;

/// <summary>A valid (non-voided) match, reduced to what statistics need.</summary>
public sealed record MatchResult(int ChallengerId, int ChallengedId, int WinnerId);

public sealed record PlayerStats(int Played, int Wins, int Losses, int ChallengesWon, int ChallengesLost, int CurrentStreak)
{
    public static readonly PlayerStats Empty = new(0, 0, 0, 0, 0, 0);

    /// <summary>Wins as challenged: total wins minus wins as challenger.</summary>
    public int DefensesWon => Wins - ChallengesWon;

    public int DefensesLost => Losses - ChallengesLost;

    /// <summary>0 to 100 with one decimal, or null with no matches.</summary>
    public double? WinPercentage => Played == 0 ? null : Math.Round(100.0 * Wins / Played, 1);
}

/// <summary>Position summary of one player: where he was before his last change, and his best ever.</summary>
public sealed record PositionSummary(int? PreviousPosition, int Movement, int? BestPosition);

public static class StatsCalculator
{
    /// <summary>
    /// Stats for every player that appears in <paramref name="matches"/>, which must be in chronological order.
    /// <see cref="PlayerStats.CurrentStreak"/> is positive for consecutive wins and negative for consecutive losses.
    /// </summary>
    public static Dictionary<int, PlayerStats> Compute(IEnumerable<MatchResult> matches)
    {
        var stats = new Dictionary<int, PlayerStats>();

        foreach (var m in matches)
        {
            Apply(stats, m.ChallengerId, isChallenger: true, won: m.WinnerId == m.ChallengerId);
            Apply(stats, m.ChallengedId, isChallenger: false, won: m.WinnerId == m.ChallengedId);
        }

        return stats;
    }

    /// <param name="changes">Position changes of a single player in application order.</param>
    /// <param name="currentPosition">Current position; the movement is previous minus current (positive = moved up).</param>
    public static PositionSummary SummarizePositions(IReadOnlyList<PositionChange> changes, int currentPosition)
    {
        var best = changes.Where(c => c.ToPosition is not null).Select(c => c.ToPosition!.Value).DefaultIfEmpty().Min();
        int? bestPosition = changes.Any(c => c.ToPosition is not null) ? best : null;

        var last = changes.Count > 0 ? changes[^1] : null;
        if (last?.FromPosition is not { } previous)
        {
            return new PositionSummary(null, 0, bestPosition);
        }

        return new PositionSummary(previous, previous - currentPosition, bestPosition);
    }

    private static void Apply(Dictionary<int, PlayerStats> stats, int playerId, bool isChallenger, bool won)
    {
        var s = stats.GetValueOrDefault(playerId, PlayerStats.Empty);

        var streak = won
            ? (s.CurrentStreak > 0 ? s.CurrentStreak + 1 : 1)
            : (s.CurrentStreak < 0 ? s.CurrentStreak - 1 : -1);

        stats[playerId] = s with
        {
            Played = s.Played + 1,
            Wins = s.Wins + (won ? 1 : 0),
            Losses = s.Losses + (won ? 0 : 1),
            ChallengesWon = s.ChallengesWon + (isChallenger && won ? 1 : 0),
            ChallengesLost = s.ChallengesLost + (isChallenger && !won ? 1 : 0),
            CurrentStreak = streak,
        };
    }
}
