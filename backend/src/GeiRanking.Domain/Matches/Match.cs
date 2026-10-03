namespace GeiRanking.Domain.Matches;

public class Match
{
    public int Id { get; set; }

    public DateTimeOffset PlayedAt { get; set; }

    public int ChallengerId { get; set; }

    public int ChallengedId { get; set; }

    public MatchScore Score { get; set; } = MatchScore.Empty;

    public CompletionType Completion { get; set; }

    public int WinnerId { get; set; }

    public string? Notes { get; set; }

    public MatchStatus Status { get; set; } = MatchStatus.Valid;

    public int? ChallengerPositionBefore { get; set; }

    public int? ChallengerPositionAfter { get; set; }

    public int? ChallengedPositionBefore { get; set; }

    public int? ChallengedPositionAfter { get; set; }

    /// <summary>Human readable "movimiento aplicado" text, derived from the ranking replay.</summary>
    public string? MovementText { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
