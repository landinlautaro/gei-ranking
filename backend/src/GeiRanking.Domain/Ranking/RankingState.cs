namespace GeiRanking.Domain.Ranking;

public enum MovementKind
{
    /// <summary>The match could not be applied (see the warning).</summary>
    NotApplied,
    ChallengerSwapped,
    DefenderMovedUp,
    /// <summary>No position changed, e.g. the #1 defended.</summary>
    NoChange,
}

public enum RankingWarningCode
{
    /// <summary>Challenge outside the 1..N places above rule. The match is still applied.</summary>
    OutOfRange,
    PlayerNotRanked,
    SamePlayer,
    InvalidWinner,
    PlayerAlreadyRanked,
}

public sealed record RankingWarning(long EventId, int? MatchId, RankingWarningCode Code);

/// <summary>Result of one match inside the replay: positions around it and what moved.</summary>
public sealed record MatchOutcome(
    int MatchId,
    long EventId,
    MovementKind Movement,
    int? ChallengerPositionBefore,
    int? ChallengerPositionAfter,
    int? ChallengedPositionBefore,
    int? ChallengedPositionAfter,
    int ChallengerId,
    int ChallengedId,
    int? DisplacedPlayerId,
    RankingWarningCode? Warning)
{
    /// <summary>Spanish (es-AR) "movimiento aplicado" text. <paramref name="nameOf"/> resolves player names.</summary>
    public string Describe(Func<int, string> nameOf)
    {
        switch (Movement)
        {
            case MovementKind.ChallengerSwapped:
                return $"{nameOf(ChallengerId)} pasa del #{ChallengerPositionBefore} al #{ChallengerPositionAfter}; "
                    + $"{nameOf(ChallengedId)} baja del #{ChallengedPositionBefore} al #{ChallengedPositionAfter}";

            case MovementKind.DefenderMovedUp:
                return $"{nameOf(ChallengedId)} defiende y sube del #{ChallengedPositionBefore} al #{ChallengedPositionAfter}; "
                    + $"{nameOf(DisplacedPlayerId!.Value)} baja al #{ChallengedPositionBefore}";

            case MovementKind.NoChange:
                return "Sin movimiento";

            default:
                return "No se aplicó movimiento";
        }
    }
}

/// <summary>One player's position change caused by one event. <c>null</c> means "not in the ranking".</summary>
public sealed record PositionChange(long EventId, DateTimeOffset OccurredAt, int PlayerId, int? FromPosition, int? ToPosition);

public sealed class RankingState
{
    private readonly Dictionary<int, int> _positions;

    public RankingState(
        IReadOnlyList<int> order,
        IReadOnlyDictionary<int, MatchOutcome> outcomes,
        IReadOnlyList<PositionChange> history,
        IReadOnlyList<RankingWarning> warnings)
    {
        Order = order;
        Outcomes = outcomes;
        History = history;
        Warnings = warnings;
        _positions = order.Select((id, i) => (id, pos: i + 1)).ToDictionary(x => x.id, x => x.pos);
    }

    /// <summary>Player ids; index 0 is position 1.</summary>
    public IReadOnlyList<int> Order { get; }

    /// <summary>Outcome of every applied (non-voided) match, by match id.</summary>
    public IReadOnlyDictionary<int, MatchOutcome> Outcomes { get; }

    /// <summary>Every position change in application order, regenerable from the events.</summary>
    public IReadOnlyList<PositionChange> History { get; }

    public IReadOnlyList<RankingWarning> Warnings { get; }

    public int? PositionOf(int playerId) => _positions.TryGetValue(playerId, out var pos) ? pos : null;
}
