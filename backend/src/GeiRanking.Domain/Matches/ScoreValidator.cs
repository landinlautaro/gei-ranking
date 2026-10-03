namespace GeiRanking.Domain.Matches;

public enum ScoreError
{
    InvalidSetCount,
    InvalidSet,
    InvalidTieBreak,
    MissingSuperTieBreak,
    UnexpectedSuperTieBreak,
    InvalidSuperTieBreak,
    ScoreNotAllowed,
    WinnerRequired,
    InvalidPartialScore,
}

public sealed record ScoreValidationResult(IReadOnlyList<ScoreError> Errors, MatchSide? Winner)
{
    public bool IsValid => Errors.Count == 0;
}

/// <summary>
/// Validates match scores (best of 3, Super Tie-Break to 10 as third set) and computes the winner.
/// </summary>
public static class ScoreValidator
{
    private const int SuperTieBreakTarget = 10;
    private const int TieBreakTarget = 7;

    /// <param name="declaredWinner">
    /// Required for walkovers and retirements. Ignored for normal matches, where the winner is computed from the score.
    /// </param>
    public static ScoreValidationResult Validate(MatchScore? score, CompletionType completion, MatchSide? declaredWinner = null)
    {
        score ??= MatchScore.Empty;
        var errors = new List<ScoreError>();

        switch (completion)
        {
            case CompletionType.Normal:
                var winner = ValidateNormal(score, errors);
                return new ScoreValidationResult(errors, errors.Count == 0 ? winner : null);

            case CompletionType.Walkover:
                if (score.Sets.Count > 0 || score.SuperTieBreak is not null)
                {
                    errors.Add(ScoreError.ScoreNotAllowed);
                }

                break;

            case CompletionType.Retirement:
                ValidatePartial(score, errors);
                break;
        }

        if (declaredWinner is null)
        {
            errors.Add(ScoreError.WinnerRequired);
        }

        return new ScoreValidationResult(errors, errors.Count == 0 ? declaredWinner : null);
    }

    /// <summary>A completed set: 6-0..6-4, 7-5 or 7-6 for the winner.</summary>
    public static bool IsValidSetGames(int a, int b)
    {
        var (hi, lo) = a >= b ? (a, b) : (b, a);
        return (hi == 6 && lo is >= 0 and <= 4) || (hi == 7 && lo is 5 or 6);
    }

    /// <summary>Tie-break to 7 with a 2-point difference (8-6, 9-7...).</summary>
    public static bool IsValidTieBreak(TieBreakScore tb) => IsValidPointRace(tb, TieBreakTarget);

    /// <summary>Super Tie-Break to 10 with a 2-point difference (10-8, 11-9, 12-10...).</summary>
    public static bool IsValidSuperTieBreak(TieBreakScore tb) => IsValidPointRace(tb, SuperTieBreakTarget);

    private static bool IsValidPointRace(TieBreakScore tb, int target)
    {
        var (hi, lo) = tb.Challenger >= tb.Challenged ? (tb.Challenger, tb.Challenged) : (tb.Challenged, tb.Challenger);
        if (lo < 0 || hi < target)
        {
            return false;
        }

        return hi == target ? hi - lo >= 2 : hi - lo == 2;
    }

    private static MatchSide? ValidateNormal(MatchScore score, List<ScoreError> errors)
    {
        if (score.Sets.Count != 2)
        {
            errors.Add(ScoreError.InvalidSetCount);
            return null;
        }

        var challengerSets = 0;
        var challengedSets = 0;
        foreach (var set in score.Sets)
        {
            if (!IsValidSetGames(set.ChallengerGames, set.ChallengedGames))
            {
                errors.Add(ScoreError.InvalidSet);
                continue;
            }

            if (set.TieBreak is not null)
            {
                var isSevenSix = Math.Max(set.ChallengerGames, set.ChallengedGames) == 7
                    && Math.Min(set.ChallengerGames, set.ChallengedGames) == 6;
                var setWonByChallenger = set.ChallengerGames > set.ChallengedGames;
                var tbWonByChallenger = set.TieBreak.Challenger > set.TieBreak.Challenged;

                if (!isSevenSix || !IsValidTieBreak(set.TieBreak) || setWonByChallenger != tbWonByChallenger)
                {
                    errors.Add(ScoreError.InvalidTieBreak);
                }
            }

            if (set.ChallengerGames > set.ChallengedGames)
            {
                challengerSets++;
            }
            else
            {
                challengedSets++;
            }
        }

        if (errors.Count > 0)
        {
            return null;
        }

        if (challengerSets == 1 && challengedSets == 1)
        {
            if (score.SuperTieBreak is null)
            {
                errors.Add(ScoreError.MissingSuperTieBreak);
                return null;
            }

            if (!IsValidSuperTieBreak(score.SuperTieBreak))
            {
                errors.Add(ScoreError.InvalidSuperTieBreak);
                return null;
            }

            return score.SuperTieBreak.Challenger > score.SuperTieBreak.Challenged
                ? MatchSide.Challenger
                : MatchSide.Challenged;
        }

        if (score.SuperTieBreak is not null)
        {
            errors.Add(ScoreError.UnexpectedSuperTieBreak);
            return null;
        }

        return challengerSets == 2 ? MatchSide.Challenger : MatchSide.Challenged;
    }

    /// <summary>A retirement keeps whatever was played: at most 2 sets (+ Super Tie-Break only after 2 sets), no completeness rules.</summary>
    private static void ValidatePartial(MatchScore score, List<ScoreError> errors)
    {
        if (score.Sets.Count > 2
            || (score.SuperTieBreak is not null && score.Sets.Count != 2)
            || score.Sets.Any(s => s.ChallengerGames is < 0 or > 7 || s.ChallengedGames is < 0 or > 7)
            || score.SuperTieBreak is { Challenger: < 0 } or { Challenged: < 0 })
        {
            errors.Add(ScoreError.InvalidPartialScore);
        }
    }
}
