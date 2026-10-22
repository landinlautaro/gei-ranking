using GeiRanking.Domain.Challenges;
using GeiRanking.Domain.Matches;
using GeiRanking.Domain.Players;

namespace GeiRanking.Api.Dtos;

public sealed record PlayerRefDto(int Id, string FullName, string? Nickname, string? PhotoPath);

public sealed record RankingRowDto(
    int Position,
    PlayerRefDto Player,
    int Played,
    int Wins,
    int Losses,
    int ChallengesWon,
    int ChallengesLost,
    int? PreviousPosition,
    /// <summary>Previous position minus current: positive = moved up, negative = moved down, 0 = no change.</summary>
    int Movement);

public sealed record PlayerListItemDto(int Id, string FullName, string? Nickname, string? PhotoPath, bool IsActive, int? Position);

public sealed record PlayerStatsDto(
    int Played,
    int Wins,
    int Losses,
    int ChallengesWon,
    int ChallengesLost,
    int DefensesWon,
    int DefensesLost,
    double? WinPercentage,
    /// <summary>Positive = consecutive wins, negative = consecutive losses.</summary>
    int CurrentStreak);

public sealed record PositionPointDto(DateTimeOffset At, int? Position);

public sealed record PlayerProfileDto(
    int Id,
    string FullName,
    string? Nickname,
    string? PhotoPath,
    Handedness? Hand,
    BackhandStyle? Backhand,
    DateTimeOffset JoinedAt,
    bool IsActive,
    int? Position,
    int? PreviousPosition,
    int Movement,
    int? BestPosition,
    PlayerStatsDto Stats,
    IReadOnlyList<RankingRowDto> CanChallenge,
    IReadOnlyList<PositionPointDto> PositionHistory,
    /// <summary>Challenges he is in that are still open (pending or agreed), soonest deadline first. Expired ones are included.</summary>
    IReadOnlyList<PublicChallengeDto> ActiveChallenges);

/// <summary>A challenge as the public sees it (no admin notes). Positions are the current ones, null when not ranked.</summary>
public sealed record PublicChallengeDto(
    int Id,
    PlayerRefDto Challenger,
    PlayerRefDto Challenged,
    int? ChallengerPosition,
    int? ChallengedPosition,
    DateTimeOffset IssuedAt,
    DateTimeOffset DeadlineAt,
    ChallengeStatus Status,
    bool IsExpired,
    /// <summary>Date and time the players agreed on, if they did.</summary>
    DateTimeOffset? ScheduledAt,
    /// <summary>Set once the result was loaded.</summary>
    int? MatchId);

/// <summary>Everything the challenges page shows. Cancelled challenges are not public.</summary>
public sealed record ChallengeBoardDto(
    /// <summary>Open and still on time, soonest deadline first.</summary>
    IReadOnlyList<PublicChallengeDto> Active,
    /// <summary>Open but past the deadline: waiting for the coordinator to decide. Oldest first.</summary>
    IReadOnlyList<PublicChallengeDto> Expired,
    /// <summary>Settled in the last 7 days, newest first.</summary>
    IReadOnlyList<PublicChallengeDto> RecentlyPlayed);

public sealed record MatchDto(
    int Id,
    DateTimeOffset PlayedAt,
    PlayerRefDto Challenger,
    PlayerRefDto Challenged,
    PlayerRefDto Winner,
    /// <summary>Text such as "6-4 3-6 10-7", "W.O." or "6-2 3-1 (ab.)".</summary>
    string Result,
    MatchScore Score,
    CompletionType Completion,
    int? ChallengerPositionBefore,
    int? ChallengerPositionAfter,
    int? ChallengedPositionBefore,
    int? ChallengedPositionAfter,
    string? MovementText,
    string? Notes);

public sealed record PagedDto<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);
