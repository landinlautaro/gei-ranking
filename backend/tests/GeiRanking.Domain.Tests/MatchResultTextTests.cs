using GeiRanking.Domain.Matches;

namespace GeiRanking.Domain.Tests;

public class MatchResultTextTests
{
    private static readonly MatchScore Score = new([new SetScore(6, 4), new SetScore(3, 6)], new TieBreakScore(10, 7));

    [Fact]
    public void Normal_ShowsScore() =>
        Assert.Equal("6-4 3-6 10-7", new Match { Score = Score }.FormatResult());

    [Fact]
    public void Walkover_ShowsWO() =>
        Assert.Equal("W.O.", new Match { Completion = CompletionType.Walkover }.FormatResult());

    [Fact]
    public void Retirement_ShowsPartialScoreAndMarker() =>
        Assert.Equal("6-2 3-1 (ab.)", new Match
        {
            Completion = CompletionType.Retirement,
            Score = new MatchScore([new SetScore(6, 2), new SetScore(3, 1)]),
        }.FormatResult());
}
