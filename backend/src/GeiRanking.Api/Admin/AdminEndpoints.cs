using GeiRanking.Api.Auth;
using GeiRanking.Api.Dtos;
using GeiRanking.Domain;
using GeiRanking.Domain.Matches;
using GeiRanking.Infrastructure;
using GeiRanking.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace GeiRanking.Api.Admin;

/// <summary>Everything under /api/admin requires a valid admin JWT.</summary>
public static class AdminEndpoints
{
    private const int DefaultPageSize = 20;
    private const int MaxPageSize = 100;

    public static void MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/api/admin").RequireAuthorization(AuthSetup.AdminPolicy);

        MapPlayers(admin.MapGroup("/players").WithTags("Admin · Players"));
        MapMatches(admin.MapGroup("/matches").WithTags("Admin · Matches"));

        admin.MapPost("/ranking/adjustments", AdjustPosition)
            .WithTags("Admin · Ranking")
            .WithName("AdjustPosition")
            .WithSummary("Moves a player to another position (the others shift). The reason is mandatory.");
    }

    // ---------------------------------------------------------------- players

    private static void MapPlayers(RouteGroupBuilder players)
    {
        players.MapGet("", async (AppDbContext db, CancellationToken ct, bool includeInactive = true) =>
        {
            var positions = await db.RankingSnapshot.AsNoTracking().ToDictionaryAsync(s => s.PlayerId, s => s.Position, ct);
            var list = await db.Players.AsNoTracking().Where(p => includeInactive || p.IsActive).OrderBy(p => p.FullName).ToListAsync(ct);
            return TypedResults.Ok(list.Select(p => PlayerAdminService.ToDto(p, positions.TryGetValue(p.Id, out var pos) ? pos : null)).ToList());
        }).WithName("AdminListPlayers").WithSummary("All players, with their current position (null when not ranked).");

        players.MapGet("{id:int}", async (int id, PlayerAdminService service, CancellationToken ct) =>
                TypedResults.Ok(await service.GetAsync(id, ct)))
            .WithName("AdminGetPlayer").WithSummary("One player.");

        players.MapPost("", async (CreatePlayerRequest request, PlayerAdminService service, CancellationToken ct) =>
            {
                var created = await service.CreateAsync(request, ct);
                return TypedResults.Created($"/api/admin/players/{created.Id}", created);
            })
            .WithName("AdminCreatePlayer").WithSummary("Adds a player at the end of the ladder, or at 'position' when given.");

        players.MapPut("{id:int}", async (int id, UpdatePlayerRequest request, PlayerAdminService service, CancellationToken ct) =>
                TypedResults.Ok(await service.UpdateAsync(id, request, ct)))
            .WithName("AdminUpdatePlayer").WithSummary("Edits personal data (not the position).");

        players.MapPost("{id:int}/deactivate", async (int id, PlayerAdminService service, CancellationToken ct) =>
                TypedResults.Ok(await service.DeactivateAsync(id, ct)))
            .WithName("AdminDeactivatePlayer")
            .WithSummary("Logical removal: leaves the ranking, everyone below moves up one place, history is kept.");

        players.MapPost("{id:int}/reactivate", async (int id, ReactivatePlayerRequest request, PlayerAdminService service, CancellationToken ct) =>
                TypedResults.Ok(await service.ReactivateAsync(id, request, ct)))
            .WithName("AdminReactivatePlayer").WithSummary("Puts an inactive player back in the ladder (last place or 'position').");

        players.MapPut("{id:int}/photo", async (int id, IFormFile file, PlayerAdminService service, CancellationToken ct) =>
            {
                await using var stream = file.OpenReadStream();
                return TypedResults.Ok(await service.SetPhotoAsync(id, stream, file.Length, ct));
            })
            .DisableAntiforgery()
            .Accepts<IFormFile>("multipart/form-data")
            .WithName("AdminSetPlayerPhoto")
            .WithSummary("Uploads a photo (JPEG, PNG or WebP, max 5 MB). It is cropped to a 400x400 square and stored as JPEG.");

        players.MapDelete("{id:int}/photo", async (int id, PlayerAdminService service, CancellationToken ct) =>
                TypedResults.Ok(await service.DeletePhotoAsync(id, ct)))
            .WithName("AdminDeletePlayerPhoto").WithSummary("Removes the photo (the generated avatar is shown again).");
    }

    // ---------------------------------------------------------------- matches

    private static void MapMatches(RouteGroupBuilder matches)
    {
        matches.MapGet("", ListMatches)
            .WithName("AdminListMatches")
            .WithSummary("All matches including voided ones. Filters: playerId, from, to, status (Valid|Voided), withWarnings.");

        matches.MapGet("{id:int}", async (int id, MatchAdminService service, CancellationToken ct) =>
                TypedResults.Ok(await service.GetAsync(id, ct)))
            .WithName("AdminGetMatch").WithSummary("One match.");

        matches.MapPost("preview", async (MatchInput input, MatchAdminService service, CancellationToken ct, int? editingMatchId = null) =>
                TypedResults.Ok(await service.PreviewAsync(input, editingMatchId, ct)))
            .WithName("AdminPreviewMatch")
            .WithSummary("Validates a result and shows the movement it would apply, without saving. Pass editingMatchId when editing.");

        matches.MapPost("", async (MatchInput input, MatchAdminService service, CancellationToken ct) =>
            {
                var result = await service.CreateAsync(input, ct);
                return TypedResults.Created($"/api/admin/matches/{result.Match.Id}", result);
            })
            .WithName("AdminCreateMatch")
            .WithSummary("Saves a result and recalculates the ranking in one transaction. Out-of-range challenges need allowOutOfRange=true.");

        matches.MapPut("{id:int}", async (int id, MatchInput input, MatchAdminService service, CancellationToken ct) =>
                TypedResults.Ok(await service.UpdateAsync(id, input, ct)))
            .WithName("AdminUpdateMatch")
            .WithSummary("Edits a match and recalculates everything after it. Later matches left out of range are flagged, not blocked.");

        matches.MapPost("{id:int}/void", async (int id, MatchAdminService service, CancellationToken ct) =>
                TypedResults.Ok(await service.VoidAsync(id, ct)))
            .WithName("AdminVoidMatch").WithSummary("Voids a match and recalculates the ranking.");
    }

    private static async Task<Results<Ok<PagedDto<AdminMatchDto>>, ValidationProblem>> ListMatches(
        AppDbContext db,
        CancellationToken ct,
        int? playerId = null,
        DateOnly? from = null,
        DateOnly? to = null,
        MatchStatus? status = null,
        bool withWarnings = false,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        if (page < 1 || pageSize < 1 || pageSize > MaxPageSize)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["paging"] = ["InvalidPaging"] });
        }

        var query = db.Matches.AsNoTracking().AsQueryable();
        if (playerId is { } pid)
        {
            query = query.Where(m => m.ChallengerId == pid || m.ChallengedId == pid);
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

        if (status is { } s)
        {
            query = query.Where(m => m.Status == s);
        }

        if (withWarnings)
        {
            query = query.Where(m => m.Warning != null);
        }

        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(m => m.PlayedAt).ThenByDescending(m => m.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        var players = await db.Players.AsNoTracking()
            .ToDictionaryAsync(p => p.Id, p => new PlayerRefDto(p.Id, p.FullName, p.Nickname, p.PhotoPath), ct);

        return TypedResults.Ok(new PagedDto<AdminMatchDto>(items.Select(m => MatchAdminService.ToDto(m, players)).ToList(), total, page, pageSize));
    }

    // ---------------------------------------------------------------- ranking

    private static async Task<Ok<ManualAdjustmentResultDto>> AdjustPosition(
        ManualAdjustmentRequest request,
        AppDbContext db,
        RankingService ranking,
        TimeProvider clock,
        ILoggerFactory loggers,
        CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        var reason = request.Reason?.Trim();
        if (string.IsNullOrEmpty(reason))
        {
            errors["reason"] = ["Required"];
        }
        else if (reason.Length > 500)
        {
            errors["reason"] = ["TooLong"];
        }

        var snapshot = await db.RankingSnapshot.AsNoTracking().ToListAsync(ct);
        var current = snapshot.FirstOrDefault(s => s.PlayerId == request.PlayerId)?.Position;

        if (current is null)
        {
            if (!await db.Players.AnyAsync(p => p.Id == request.PlayerId, ct))
            {
                throw ApiProblemException.NotFound("Player");
            }

            throw ApiProblemException.Conflict("PlayerNotInRanking", "The player is not in the ranking.");
        }

        if (request.NewPosition < 1 || request.NewPosition > snapshot.Count)
        {
            errors["newPosition"] = ["OutOfBounds"];
        }
        else if (request.NewPosition == current)
        {
            errors["newPosition"] = ["SamePosition"];
        }

        if (errors.Count > 0)
        {
            throw new ApiProblemException(StatusCodes.Status422UnprocessableEntity, "ValidationFailed", "One or more fields are invalid.", errors);
        }

        var now = clock.GetUtcNow();
        await ranking.ExecuteAsync(async (context, token) =>
        {
            context.RankingEvents.Add(new StoredRankingEvent
            {
                Kind = RankingEventKind.ManualAdjustment,
                PlayerId = request.PlayerId,
                Position = request.NewPosition,
                Reason = reason,
                OccurredAt = now,
                CreatedAt = now,
            });
            await context.SaveChangesAsync(token);
        }, ct);

        loggers.CreateLogger("GeiRanking.Audit").LogInformation(
            "Manual adjustment: player {PlayerId} moved from {From} to {To}. Reason: {Reason}", request.PlayerId, current.Value, request.NewPosition, reason);
        return TypedResults.Ok(new ManualAdjustmentResultDto(request.PlayerId, current.Value, request.NewPosition));
    }
}
