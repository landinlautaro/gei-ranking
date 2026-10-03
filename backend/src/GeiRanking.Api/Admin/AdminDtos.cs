using GeiRanking.Api.Dtos;
using GeiRanking.Domain.Matches;
using GeiRanking.Domain.Players;
using GeiRanking.Domain.Ranking;

namespace GeiRanking.Api.Admin;

// ---- Players ----

public sealed record CreatePlayerRequest(
    string? FullName,
    string? Nickname,
    Handedness? Hand,
    BackhandStyle? Backhand,
    DateTimeOffset? JoinedAt,
    /// <summary>Wanted ladder position; null = last place.</summary>
    int? Position);

public sealed record UpdatePlayerRequest(
    string? FullName,
    string? Nickname,
    Handedness? Hand,
    BackhandStyle? Backhand,
    DateTimeOffset? JoinedAt);

public sealed record ReactivatePlayerRequest(int? Position);

public sealed record AdminPlayerDto(
    int Id,
    string FullName,
    string? Nickname,
    string? PhotoPath,
    Handedness? Hand,
    BackhandStyle? Backhand,
    DateTimeOffset JoinedAt,
    bool IsActive,
    int? Position);

// ---- Matches ----

/// <summary>Body to preview, create or edit a match.</summary>
public sealed record MatchInput(
    int ChallengerId,
    int ChallengedId,
    DateTimeOffset PlayedAt,
    CompletionType Completion,
    /// <summary>Sets and Super Tie-Break. Omit for a walkover.</summary>
    MatchScore? Score,
    /// <summary>Required for walkovers and retirements; ignored for normal matches (computed from the score).</summary>
    MatchSide? Winner,
    string? Notes,
    /// <summary>Confirms saving a challenge outside the 5-place range.</summary>
    bool AllowOutOfRange = false);

public sealed record AdminMatchDto(
    int Id,
    DateTimeOffset PlayedAt,
    PlayerRefDto Challenger,
    PlayerRefDto Challenged,
    PlayerRefDto Winner,
    string Result,
    MatchScore Score,
    CompletionType Completion,
    MatchStatus Status,
    int? ChallengerPositionBefore,
    int? ChallengerPositionAfter,
    int? ChallengedPositionBefore,
    int? ChallengedPositionAfter,
    string? MovementText,
    RankingWarningCode? Warning,
    string? Notes,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

/// <summary>Result of creating, editing or voiding a match.</summary>
public sealed record MatchChangeResultDto(
    AdminMatchDto Match,
    /// <summary>Other matches that became out of range (or unapplicable) because of this change. They are flagged, never blocked.</summary>
    IReadOnlyList<int> NewlyWarnedMatchIds);

public sealed record MatchPreviewDto(
    /// <summary>False when there are field errors (see <see cref="Errors"/>) or the match could not be applied.</summary>
    bool IsValid,
    IReadOnlyDictionary<string, string[]> Errors,
    MatchSide? WinnerSide,
    int? WinnerId,
    MovementKind? Movement,
    string? MovementText,
    int? ChallengerPositionBefore,
    int? ChallengerPositionAfter,
    int? ChallengedPositionBefore,
    int? ChallengedPositionAfter,
    RankingWarningCode? Warning,
    /// <summary>True when the challenge is out of range: saving needs <c>allowOutOfRange: true</c>.</summary>
    bool RequiresOutOfRangeConfirmation,
    IReadOnlyList<int> NewlyWarnedMatchIds);

// ---- Manual adjustment ----

public sealed record ManualAdjustmentRequest(int PlayerId, int NewPosition, string? Reason);

public sealed record ManualAdjustmentResultDto(int PlayerId, int FromPosition, int ToPosition);
