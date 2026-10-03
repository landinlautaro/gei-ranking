using GeiRanking.Domain.Ranking;
using GeiRanking.Domain.Stats;

namespace GeiRanking.Domain.Tests;

public class StatsCalculatorTests
{
    private static readonly DateTimeOffset T = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private static PositionChange Change(int player, int? from, int? to) => new(1, T, player, from, to);

    [Fact]
    public void Compute_SplitsChallengesAndDefenses()
    {
        var matches = new List<MatchResult>
        {
            new(1, 2, 1), // 1 wins as challenger
            new(1, 3, 3), // 1 loses as challenger
            new(4, 1, 1), // 1 wins as challenged
            new(5, 1, 5), // 1 loses as challenged
            new(1, 6, 1), // 1 wins as challenger
        };

        var s = StatsCalculator.Compute(matches)[1];

        Assert.Equal(5, s.Played);
        Assert.Equal(3, s.Wins);
        Assert.Equal(2, s.Losses);
        Assert.Equal(2, s.ChallengesWon);
        Assert.Equal(1, s.ChallengesLost);
        Assert.Equal(1, s.DefensesWon);
        Assert.Equal(1, s.DefensesLost);
        Assert.Equal(60.0, s.WinPercentage);
    }

    [Fact]
    public void Compute_Streak_CountsConsecutiveResultsFromTheLatest()
    {
        var matches = new List<MatchResult>
        {
            new(1, 2, 2), // 1 loses
            new(1, 3, 1), // wins
            new(1, 4, 1), // wins
            new(5, 1, 1), // wins
        };

        var stats = StatsCalculator.Compute(matches);

        Assert.Equal(3, stats[1].CurrentStreak);
        Assert.Equal(1, stats[2].CurrentStreak);
        Assert.Equal(-1, stats[3].CurrentStreak);
    }

    [Fact]
    public void Compute_Streak_IsNegativeAfterLosses()
    {
        var matches = new List<MatchResult> { new(1, 2, 1), new(1, 3, 3), new(4, 1, 4) };

        Assert.Equal(-2, StatsCalculator.Compute(matches)[1].CurrentStreak);
    }

    [Fact]
    public void Compute_PlayerWithoutMatches_IsNotPresent_AndEmptyHasNoPercentage()
    {
        var stats = StatsCalculator.Compute([new MatchResult(1, 2, 1)]);

        Assert.False(stats.ContainsKey(9));
        Assert.Null(PlayerStats.Empty.WinPercentage);
        Assert.Equal(0, PlayerStats.Empty.Played);
    }

    [Fact]
    public void SummarizePositions_UsesLastChange_ForPreviousAndMovement()
    {
        var changes = new[] { Change(7, null, 20), Change(7, 20, 17), Change(7, 17, 18) };

        var summary = StatsCalculator.SummarizePositions(changes, currentPosition: 18);

        Assert.Equal(17, summary.PreviousPosition);
        Assert.Equal(-1, summary.Movement);
        Assert.Equal(17, summary.BestPosition);
    }

    [Fact]
    public void SummarizePositions_MovingUp_IsPositive()
    {
        var changes = new[] { Change(7, null, 20), Change(7, 20, 17) };

        var summary = StatsCalculator.SummarizePositions(changes, 17);

        Assert.Equal(3, summary.Movement);
    }

    [Fact]
    public void SummarizePositions_OnlyEntry_HasNoPreviousPosition()
    {
        var summary = StatsCalculator.SummarizePositions([Change(7, null, 20)], 20);

        Assert.Null(summary.PreviousPosition);
        Assert.Equal(0, summary.Movement);
        Assert.Equal(20, summary.BestPosition);
    }

    [Fact]
    public void SummarizePositions_NoHistory_IsEmpty()
    {
        var summary = StatsCalculator.SummarizePositions([], 5);

        Assert.Null(summary.PreviousPosition);
        Assert.Null(summary.BestPosition);
    }
}
