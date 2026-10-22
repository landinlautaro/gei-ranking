using GeiRanking.Api.Dtos;
using GeiRanking.Domain.Challenges;
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

// ---- Challenges ----

/// <summary>Rules a challenge can break without being rejected: the admin sees them and confirms.</summary>
public enum ChallengeWarning
{
    OutOfRange,
    AlreadyChallengedThisWeek,
    OutsideChallengeWindow,
}

/// <summary>What the admin list can show. Expired is derived (active past its deadline), the rest are stored statuses.</summary>
public enum ChallengeFilter
{
    Active,
    Expired,
    Pending,
    Scheduled,
    Played,
    Cancelled,
}

/// <summary>Body to preview or register a challenge.</summary>
public sealed record ChallengeInput(
    int ChallengerId,
    int ChallengedId,
    /// <summary>When it was announced; null = now.</summary>
    DateTimeOffset? IssuedAt,
    DateTimeOffset? ScheduledAt,
    string? Notes,
    /// <summary>Confirms saving despite the warnings of the preview.</summary>
    bool ConfirmWarnings = false);

/// <summary>Edits an active challenge. Null <see cref="ScheduledAt"/> clears the agreed date.</summary>
public sealed record ChallengeUpdateRequest(
    DateTimeOffset IssuedAt,
    DateTimeOffset DeadlineAt,
    DateTimeOffset? ScheduledAt,
    string? Notes);

public sealed record CancelChallengeRequest(string? Reason);

public sealed record AdminChallengeDto(
    int Id,
    PlayerRefDto Challenger,
    PlayerRefDto Challenged,
    int? ChallengerPosition,
    int? ChallengedPosition,
    DateTimeOffset IssuedAt,
    DateTimeOffset DeadlineAt,
    ChallengeStatus Status,
    bool IsExpired,
    DateTimeOffset? ScheduledAt,
    int? MatchId,
    string? Notes,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record ChallengePreviewDto(
    /// <summary>False when there are field errors (see <see cref="Errors"/>).</summary>
    bool IsValid,
    IReadOnlyDictionary<string, string[]> Errors,
    int? ChallengerPosition,
    int? ChallengedPosition,
    DateTimeOffset? DeadlineAt,
    IReadOnlyList<ChallengeWarning> Warnings);

// ---- Manual adjustment ----

public sealed record ManualAdjustmentRequest(int PlayerId, int NewPosition, string? Reason);

public sealed record ManualAdjustmentResultDto(int PlayerId, int FromPosition, int ToPosition);
