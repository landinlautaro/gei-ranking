namespace GeiRanking.Domain.Matches;

public enum MatchSide
{
    Challenger,
    Challenged,
}

public enum CompletionType
{
    Normal,
    Walkover,
    Retirement,
}

public enum MatchStatus
{
    Valid,
    Voided,
}

/// <summary>Point count of a tie-break (7-6 set) or of the deciding Super Tie-Break.</summary>
public sealed record TieBreakScore(int Challenger, int Challenged);

/// <summary>Games of one set. The tie-break score of a 7-6 set is optional.</summary>
public sealed record SetScore(int ChallengerGames, int ChallengedGames, TieBreakScore? TieBreak = null);

/// <summary>
/// Score of a match: up to two regular sets plus an optional Super Tie-Break to 10 that replaces the third set.
/// </summary>
public sealed record MatchScore(IReadOnlyList<SetScore> Sets, TieBreakScore? SuperTieBreak = null)
{
    public static readonly MatchScore Empty = new([]);

    /// <summary>Text as shown in the results list, e.g. <c>6-4 3-6 10-7</c>.</summary>
    public string Format()
    {
        var parts = Sets.Select(s =>
            s.TieBreak is null
                ? $"{s.ChallengerGames}-{s.ChallengedGames}"
                : $"{s.ChallengerGames}-{s.ChallengedGames}({Math.Min(s.TieBreak.Challenger, s.TieBreak.Challenged)})").ToList();

        if (SuperTieBreak is not null)
        {
            parts.Add($"{SuperTieBreak.Challenger}-{SuperTieBreak.Challenged}");
        }

        return string.Join(' ', parts);
    }
}
