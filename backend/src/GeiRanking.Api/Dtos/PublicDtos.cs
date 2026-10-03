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
    IReadOnlyList<PositionPointDto> PositionHistory);

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
