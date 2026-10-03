namespace GeiRanking.Domain.Ranking;

/// <summary>Tunable ladder rules, kept in one place so they are easy to change.</summary>
public sealed record RankingRules(int MaxChallengeRange = 5)
{
    public static readonly RankingRules Default = new();

    /// <summary>A challenger can only challenge someone 1 to <see cref="MaxChallengeRange"/> places above.</summary>
    public bool IsChallengeInRange(int challengerPosition, int challengedPosition)
    {
        var gap = challengerPosition - challengedPosition;
        return gap >= 1 && gap <= MaxChallengeRange;
    }
}
