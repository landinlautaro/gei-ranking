using GeiRanking.Api.Dtos;
using GeiRanking.Domain;
using GeiRanking.Domain.Challenges;
using GeiRanking.Domain.Matches;
using GeiRanking.Domain.Stats;
using GeiRanking.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace GeiRanking.Api.Endpoints;

/// <summary>Public read-only endpoints (no login).</summary>
public static class PublicEndpoints
{
    private const int DefaultPageSize = 20;
    private const int MaxPageSize = 100;
    private const int ChallengeRange = 5;
    private const int RecentDays = 7;

    public static void MapPublicEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api").WithTags("Public");

        api.MapGet("/ranking", GetRanking)
            .WithName("GetRanking")
            .WithSummary("Current ranking with PJ/PG/PP, challenges won/lost, previous position and movement.");

        api.MapGet("/players", GetPlayers)
            .WithName("GetPlayers")
            .WithSummary("Players ordered by name (for filters and search). Inactive players are excluded unless requested.");

        api.MapGet("/players/{id:int}", GetPlayer)
            .WithName("GetPlayer")
            .WithSummary("Player profile: data, stats, who he can challenge today and his position history.");

        api.MapGet("/matches", GetMatches)
            .WithName("GetMatches")
            .WithSummary("Valid matches, newest first. Filter by player and by club-local date range (yyyy-MM-dd, inclusive).");

        api.MapGet("/challenges", GetChallenges)
            .WithName("GetChallenges")
            .WithSummary("Open challenges (on time and expired) and the ones settled in the last 7 days. Cancelled ones are not public.");
    }

    private static async Task<Ok<ChallengeBoardDto>> GetChallenges(AppDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var open = await PublicQueries.LoadActiveChallenges(db, clock, playerId: null, ct);

        var since = clock.GetUtcNow().AddDays(-RecentDays);
        var recent = await db.Challenges.AsNoTracking()
            .Where(c => c.Status == ChallengeStatus.Played && c.UpdatedAt >= since)
            .OrderByDescending(c => c.UpdatedAt).ThenByDescending(c => c.Id)
            .ToListAsync(ct);

        return TypedResults.Ok(new ChallengeBoardDto(
            open.Where(c => !c.IsExpired).ToList(),
            open.Where(c => c.IsExpired).ToList(),
            await PublicQueries.ToChallengeDtos(db, clock, recent, ct)));
    }

    private static async Task<Ok<List<RankingRowDto>>> GetRanking(AppDbContext db, CancellationToken ct)
    {
        var players = await PublicQueries.LoadPlayerRefs(db, ct);
        var stats = await PublicQueries.LoadStats(db, ct);
        var history = await PublicQueries.LoadHistory(db, ct);
        var snapshot = await db.RankingSnapshot.AsNoTracking().OrderBy(s => s.Position).ToListAsync(ct);

        return TypedResults.Ok(snapshot
            .Select(s => PublicQueries.ToRankingRow(s.Position, players[s.PlayerId], stats, history))
            .ToList());
    }

    private static async Task<Ok<List<PlayerListItemDto>>> GetPlayers(AppDbContext db, CancellationToken ct, bool includeInactive = false)
    {
        var positions = await db.RankingSnapshot.AsNoTracking().ToDictionaryAsync(s => s.PlayerId, s => s.Position, ct);
        var players = await db.Players.AsNoTracking()
            .Where(p => includeInactive || p.IsActive)
            .OrderBy(p => p.FullName)
            .ToListAsync(ct);

        return TypedResults.Ok(players
            .Select(p => new PlayerListItemDto(p.Id, p.FullName, p.Nickname, p.PhotoPath, p.IsActive, positions.TryGetValue(p.Id, out var pos) ? pos : null))
            .ToList());
    }

    private static async Task<Results<Ok<PlayerProfileDto>, NotFound>> GetPlayer(int id, AppDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var player = await db.Players.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, ct);
        if (player is null)
        {
            return TypedResults.NotFound();
        }

        var players = await PublicQueries.LoadPlayerRefs(db, ct);
        var allStats = await PublicQueries.LoadStats(db, ct);
        var history = await PublicQueries.LoadHistory(db, ct);
        var snapshot = await db.RankingSnapshot.AsNoTracking().OrderBy(s => s.Position).ToListAsync(ct);

        var position = snapshot.FirstOrDefault(s => s.PlayerId == id)?.Position;
        var changes = history[id].ToList();
        var summary = StatsCalculator.SummarizePositions(changes, position ?? 0);
        var stats = allStats.GetValueOrDefault(id, PlayerStats.Empty);

        // The ones he can challenge today: the 5 places right above him (nobody if he is not ranked or is #1).
        var canChallenge = position is null
            ? []
            : snapshot
                .Where(s => s.Position < position && position - s.Position <= ChallengeRange)
                .Select(s => PublicQueries.ToRankingRow(s.Position, players[s.PlayerId], allStats, history))
                .ToList();

        var dto = new PlayerProfileDto(
            player.Id, player.FullName, player.Nickname, player.PhotoPath, player.Hand, player.Backhand,
            player.JoinedAt, player.IsActive, position,
            position is null ? null : summary.PreviousPosition,
            position is null ? 0 : summary.Movement,
            summary.BestPosition,
            new PlayerStatsDto(stats.Played, stats.Wins, stats.Losses, stats.ChallengesWon, stats.ChallengesLost,
                stats.DefensesWon, stats.DefensesLost, stats.WinPercentage, stats.CurrentStreak),
            canChallenge,
            changes.Select(c => new PositionPointDto(c.OccurredAt, c.ToPosition)).ToList(),
            await PublicQueries.LoadActiveChallenges(db, clock, id, ct));

        return TypedResults.Ok(dto);
    }

    private static async Task<Results<Ok<PagedDto<MatchDto>>, ValidationProblem>> GetMatches(
        AppDbContext db,
        CancellationToken ct,
        int? playerId = null,
        int? opponentId = null,
        DateOnly? from = null,
        DateOnly? to = null,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        if (page < 1 || pageSize < 1 || pageSize > MaxPageSize)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["paging"] = [$"page must be >= 1 and pageSize between 1 and {MaxPageSize}."],
            });
        }

        if (from is not null && to is not null && from > to)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["from"] = ["from must not be after to."] });
        }

        if (opponentId is not null && (playerId is null || playerId == opponentId))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["opponentId"] = ["opponentId requires a playerId different from it."],
            });
        }

        var query = db.Matches.AsNoTracking().Where(m => m.Status == MatchStatus.Valid);

        if (playerId is { } pid)
        {
            query = opponentId is { } oid
                ? query.Where(m => (m.ChallengerId == pid && m.ChallengedId == oid) || (m.ChallengerId == oid && m.ChallengedId == pid))
                : query.Where(m => m.ChallengerId == pid || m.ChallengedId == pid);
        }

        if (from is { } f)
        {
            var start = ClubClock.StartOfDayUtc(f);
            query = query.Where(m => m.PlayedAt >= start);
        }

        if (to is { } t)
        {
            var endExclusive = ClubClock.StartOfDayUtc(t.AddDays(1));
            query = query.Where(m => m.PlayedAt < endExclusive);
        }

        var total = await query.CountAsync(ct);
        var matches = await query
            .OrderByDescending(m => m.PlayedAt).ThenByDescending(m => m.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .ToListAsync(ct);

        var players = await PublicQueries.LoadPlayerRefs(db, ct);
        var items = matches.Select(m => PublicQueries.ToMatchDto(m, players)).ToList();

        return TypedResults.Ok(new PagedDto<MatchDto>(items, total, page, pageSize));
    }
}
