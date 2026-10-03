using GeiRanking.Domain.Matches;

namespace GeiRanking.Domain.Tests;

public class ScoreValidatorTests
{
    private static MatchScore Sets(params (int c, int d)[] sets) =>
        new(sets.Select(s => new SetScore(s.c, s.d)).ToList());

    private static MatchScore Sets(TieBreakScore stb, params (int c, int d)[] sets) =>
        new(sets.Select(s => new SetScore(s.c, s.d)).ToList(), stb);

    [Theory]
    [InlineData(6, 0)]
    [InlineData(6, 1)]
    [InlineData(6, 2)]
    [InlineData(6, 3)]
    [InlineData(6, 4)]
    [InlineData(7, 5)]
    [InlineData(7, 6)]
    public void ValidSets_AreAccepted_ForEitherPlayer(int winnerGames, int loserGames)
    {
        Assert.True(ScoreValidator.IsValidSetGames(winnerGames, loserGames));
        Assert.True(ScoreValidator.IsValidSetGames(loserGames, winnerGames));
    }

    [Theory]
    [InlineData(6, 5)]
    [InlineData(5, 5)]
    [InlineData(6, 6)]
    [InlineData(7, 4)]
    [InlineData(7, 7)]
    [InlineData(8, 6)]
    [InlineData(8, 4)]
    [InlineData(5, 3)]
    [InlineData(0, 0)]
    [InlineData(-1, 6)]
    [InlineData(6, -1)]
    public void InvalidSets_AreRejected(int a, int b)
    {
        Assert.False(ScoreValidator.IsValidSetGames(a, b));
    }

    [Fact]
    public void Normal_TwoSetsWin_ChallengerWins()
    {
        var result = ScoreValidator.Validate(Sets((6, 4), (7, 5)), CompletionType.Normal);

        Assert.True(result.IsValid);
        Assert.Equal(MatchSide.Challenger, result.Winner);
    }

    [Fact]
    public void Normal_TwoSetsWin_ChallengedWins()
    {
        var result = ScoreValidator.Validate(Sets((2, 6), (6, 7)), CompletionType.Normal);

        Assert.True(result.IsValid);
        Assert.Equal(MatchSide.Challenged, result.Winner);
    }

    [Theory]
    [InlineData(10, 7, MatchSide.Challenger)]
    [InlineData(10, 8, MatchSide.Challenger)]
    [InlineData(11, 9, MatchSide.Challenger)]
    [InlineData(12, 10, MatchSide.Challenger)]
    [InlineData(7, 10, MatchSide.Challenged)]
    [InlineData(9, 11, MatchSide.Challenged)]
    public void Normal_ThirdSetSuperTieBreak_DecidesWinner(int c, int d, MatchSide expected)
    {
        var result = ScoreValidator.Validate(Sets(new TieBreakScore(c, d), (6, 4), (3, 6)), CompletionType.Normal);

        Assert.True(result.IsValid);
        Assert.Equal(expected, result.Winner);
    }

    [Theory]
    [InlineData(10, 9)]   // needs 2 points of difference
    [InlineData(11, 10)]
    [InlineData(11, 8)]   // past 10 the difference must be exactly 2
    [InlineData(9, 7)]    // below 10
    [InlineData(10, 10)]
    [InlineData(7, 9)]    // below 10 for either side
    public void Normal_InvalidSuperTieBreak_IsRejected(int c, int d)
    {
        var result = ScoreValidator.Validate(Sets(new TieBreakScore(c, d), (6, 4), (3, 6)), CompletionType.Normal);

        Assert.Contains(ScoreError.InvalidSuperTieBreak, result.Errors);
        Assert.Null(result.Winner);
    }

    [Fact]
    public void Normal_OneAllWithoutSuperTieBreak_IsRejected()
    {
        var result = ScoreValidator.Validate(Sets((6, 4), (3, 6)), CompletionType.Normal);

        Assert.Contains(ScoreError.MissingSuperTieBreak, result.Errors);
    }

    [Fact]
    public void Normal_SuperTieBreakAfterStraightSets_IsRejected()
    {
        var result = ScoreValidator.Validate(Sets(new TieBreakScore(10, 5), (6, 4), (6, 3)), CompletionType.Normal);

        Assert.Contains(ScoreError.UnexpectedSuperTieBreak, result.Errors);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(3)]
    public void Normal_WrongNumberOfSets_IsRejected(int count)
    {
        var sets = Enumerable.Repeat((6, 4), count).ToArray();

        var result = ScoreValidator.Validate(Sets(sets), CompletionType.Normal);

        Assert.Contains(ScoreError.InvalidSetCount, result.Errors);
    }

    [Fact]
    public void Normal_NullScore_IsRejected()
    {
        var result = ScoreValidator.Validate(null, CompletionType.Normal);

        Assert.False(result.IsValid);
    }

    [Fact]
    public void Normal_InvalidSet_IsRejected()
    {
        var result = ScoreValidator.Validate(Sets((6, 5), (6, 4)), CompletionType.Normal);

        Assert.Contains(ScoreError.InvalidSet, result.Errors);
        Assert.Null(result.Winner);
    }

    [Fact]
    public void Normal_DeclaredWinnerIsIgnored()
    {
        var result = ScoreValidator.Validate(Sets((6, 4), (6, 4)), CompletionType.Normal, MatchSide.Challenged);

        Assert.Equal(MatchSide.Challenger, result.Winner);
    }

    [Fact]
    public void TieBreak_IsOptionalInSevenSix()
    {
        var withTb = new MatchScore([new SetScore(7, 6, new TieBreakScore(7, 4)), new SetScore(6, 3)]);
        var withoutTb = new MatchScore([new SetScore(7, 6), new SetScore(6, 3)]);

        Assert.True(ScoreValidator.Validate(withTb, CompletionType.Normal).IsValid);
        Assert.True(ScoreValidator.Validate(withoutTb, CompletionType.Normal).IsValid);
    }

    [Theory]
    [InlineData(7, 6, 5, 7)]   // tie-break winner differs from the set winner
    [InlineData(7, 6, 7, 6)]   // difference of 1
    [InlineData(7, 6, 6, 4)]   // below 7
    [InlineData(7, 6, 10, 7)]  // past 7 the difference must be exactly 2
    [InlineData(7, 5, 7, 3)]   // tie-break only exists in a 7-6 set
    public void TieBreak_Invalid_IsRejected(int c, int d, int tbC, int tbD)
    {
        var score = new MatchScore([new SetScore(c, d, new TieBreakScore(tbC, tbD)), new SetScore(6, 3)]);

        var result = ScoreValidator.Validate(score, CompletionType.Normal);

        Assert.Contains(ScoreError.InvalidTieBreak, result.Errors);
    }

    [Fact]
    public void TieBreak_ExtendedWithTwoPointDifference_IsAccepted()
    {
        var score = new MatchScore([new SetScore(6, 7, new TieBreakScore(9, 11)), new SetScore(3, 6)]);

        var result = ScoreValidator.Validate(score, CompletionType.Normal);

        Assert.True(result.IsValid);
        Assert.Equal(MatchSide.Challenged, result.Winner);
    }

    [Fact]
    public void Walkover_WithoutScore_UsesDeclaredWinner()
    {
        var result = ScoreValidator.Validate(null, CompletionType.Walkover, MatchSide.Challenger);

        Assert.True(result.IsValid);
        Assert.Equal(MatchSide.Challenger, result.Winner);
    }

    [Fact]
    public void Walkover_WithoutWinner_IsRejected()
    {
        var result = ScoreValidator.Validate(MatchScore.Empty, CompletionType.Walkover);

        Assert.Contains(ScoreError.WinnerRequired, result.Errors);
    }

    [Fact]
    public void Walkover_WithScore_IsRejected()
    {
        var result = ScoreValidator.Validate(Sets((6, 0), (6, 0)), CompletionType.Walkover, MatchSide.Challenged);

        Assert.Contains(ScoreError.ScoreNotAllowed, result.Errors);
    }

    [Fact]
    public void Retirement_PartialScore_UsesDeclaredWinner()
    {
        var result = ScoreValidator.Validate(Sets((6, 4), (2, 3)), CompletionType.Retirement, MatchSide.Challenger);

        Assert.True(result.IsValid);
        Assert.Equal(MatchSide.Challenger, result.Winner);
    }

    [Fact]
    public void Retirement_WinnerCanBeBehindOnTheScoreboard()
    {
        var result = ScoreValidator.Validate(Sets((4, 6), (1, 3)), CompletionType.Retirement, MatchSide.Challenger);

        Assert.True(result.IsValid);
        Assert.Equal(MatchSide.Challenger, result.Winner);
    }

    [Fact]
    public void Retirement_WithoutWinner_IsRejected()
    {
        var result = ScoreValidator.Validate(Sets((6, 4), (2, 3)), CompletionType.Retirement);

        Assert.Contains(ScoreError.WinnerRequired, result.Errors);
    }

    [Fact]
    public void Retirement_InSuperTieBreak_IsAccepted()
    {
        var result = ScoreValidator.Validate(
            Sets(new TieBreakScore(4, 2), (6, 4), (3, 6)), CompletionType.Retirement, MatchSide.Challenger);

        Assert.True(result.IsValid);
    }

    [Theory]
    [InlineData(3)]
    public void Retirement_TooManySets_IsRejected(int count)
    {
        var sets = Enumerable.Repeat((6, 4), count).ToArray();

        var result = ScoreValidator.Validate(Sets(sets), CompletionType.Retirement, MatchSide.Challenger);

        Assert.Contains(ScoreError.InvalidPartialScore, result.Errors);
    }

    [Fact]
    public void Retirement_SuperTieBreakBeforeTwoSets_IsRejected()
    {
        var result = ScoreValidator.Validate(
            Sets(new TieBreakScore(4, 2), (6, 4)), CompletionType.Retirement, MatchSide.Challenger);

        Assert.Contains(ScoreError.InvalidPartialScore, result.Errors);
    }

    [Fact]
    public void Retirement_NegativeOrHugeGames_AreRejected()
    {
        Assert.Contains(ScoreError.InvalidPartialScore,
            ScoreValidator.Validate(Sets((-1, 3)), CompletionType.Retirement, MatchSide.Challenger).Errors);
        Assert.Contains(ScoreError.InvalidPartialScore,
            ScoreValidator.Validate(Sets((9, 3)), CompletionType.Retirement, MatchSide.Challenger).Errors);
    }

    [Fact]
    public void Format_ProducesResultText()
    {
        var score = Sets(new TieBreakScore(10, 7), (6, 4), (3, 6));
        var withTb = new MatchScore([new SetScore(7, 6, new TieBreakScore(7, 3)), new SetScore(6, 1)]);

        Assert.Equal("6-4 3-6 10-7", score.Format());
        Assert.Equal("7-6(3) 6-1", withTb.Format());
        Assert.Equal("", MatchScore.Empty.Format());
    }
}
