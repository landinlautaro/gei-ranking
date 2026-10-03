using GeiRanking.Domain.Players;
using GeiRanking.Infrastructure;
using GeiRanking.Infrastructure.Persistence;
using GeiRanking.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;

namespace GeiRanking.Api.Admin;

public sealed class PlayerAdminService(AppDbContext db, RankingService ranking, IPhotoStorage photos, TimeProvider clock, ILogger<PlayerAdminService> logger)
{
    public const long MaxPhotoBytes = 5 * 1024 * 1024;

    public async Task<AdminPlayerDto> CreateAsync(CreatePlayerRequest request, CancellationToken ct)
    {
        var errors = ValidateFields(request.FullName, request.Nickname);
        if (request.Position is < 1)
        {
            errors["position"] = ["MustBePositive"];
        }

        ThrowIfAny(errors);

        var now = clock.GetUtcNow();
        var id = 0;
        await ranking.ExecuteAsync(async (context, token) =>
        {
            var player = new Player
            {
                FullName = request.FullName!.Trim(),
                Nickname = Clean(request.Nickname),
                Hand = request.Hand,
                Backhand = request.Backhand,
                JoinedAt = request.JoinedAt?.ToUniversalTime() ?? now,
                IsActive = true,
            };
            context.Players.Add(player);
            await context.SaveChangesAsync(token);

            context.RankingEvents.Add(new StoredRankingEvent
            {
                Kind = RankingEventKind.PlayerAdded,
                PlayerId = player.Id,
                Position = request.Position,
                OccurredAt = now,
                CreatedAt = now,
            });
            await context.SaveChangesAsync(token);
            id = player.Id;
        }, ct);

        logger.LogInformation("Player {PlayerId} created: {FullName} at position {Position}", id, request.FullName!.Trim(), request.Position?.ToString() ?? "last");
        return await GetAsync(id, ct);
    }

    public async Task<AdminPlayerDto> UpdateAsync(int id, UpdatePlayerRequest request, CancellationToken ct)
    {
        ThrowIfAny(ValidateFields(request.FullName, request.Nickname));
        await EnsureExistsAsync(id, ct);

        // Rebuild too: the stored "movement" texts of this player's matches contain his name.
        await ranking.ExecuteAsync(async (context, token) =>
        {
            var player = await context.Players.SingleAsync(p => p.Id == id, token);
            player.FullName = request.FullName!.Trim();
            player.Nickname = Clean(request.Nickname);
            player.Hand = request.Hand;
            player.Backhand = request.Backhand;
            if (request.JoinedAt is { } joinedAt)
            {
                player.JoinedAt = joinedAt.ToUniversalTime();
            }

            await context.SaveChangesAsync(token);
        }, ct);

        logger.LogInformation("Player {PlayerId} data updated", id);
        return await GetAsync(id, ct);
    }

    /// <summary>Logical removal: leaves the ranking (everyone below moves up) and keeps all history.</summary>
    public async Task<AdminPlayerDto> DeactivateAsync(int id, CancellationToken ct)
    {
        var player = await db.Players.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, ct) ?? throw ApiProblemException.NotFound("Player");
        if (!player.IsActive)
        {
            throw ApiProblemException.Conflict("AlreadyInactive", "The player is already inactive.");
        }

        var now = clock.GetUtcNow();
        await ranking.ExecuteAsync(async (context, token) =>
        {
            (await context.Players.SingleAsync(p => p.Id == id, token)).IsActive = false;
            context.RankingEvents.Add(new StoredRankingEvent { Kind = RankingEventKind.PlayerRemoved, PlayerId = id, OccurredAt = now, CreatedAt = now });
            await context.SaveChangesAsync(token);
        }, ct);

        logger.LogInformation("Player {PlayerId} deactivated (left the ranking)", id);
        return await GetAsync(id, ct);
    }

    public async Task<AdminPlayerDto> ReactivateAsync(int id, ReactivatePlayerRequest request, CancellationToken ct)
    {
        if (request.Position is < 1)
        {
            throw ApiProblemException.Invalid("position", "MustBePositive");
        }

        var player = await db.Players.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, ct) ?? throw ApiProblemException.NotFound("Player");
        if (player.IsActive)
        {
            throw ApiProblemException.Conflict("AlreadyActive", "The player is already active.");
        }

        var now = clock.GetUtcNow();
        await ranking.ExecuteAsync(async (context, token) =>
        {
            (await context.Players.SingleAsync(p => p.Id == id, token)).IsActive = true;
            context.RankingEvents.Add(new StoredRankingEvent
            {
                Kind = RankingEventKind.PlayerAdded, PlayerId = id, Position = request.Position, OccurredAt = now, CreatedAt = now,
            });
            await context.SaveChangesAsync(token);
        }, ct);

        logger.LogInformation("Player {PlayerId} reactivated at position {Position}", id, request.Position?.ToString() ?? "last");
        return await GetAsync(id, ct);
    }

    public async Task<AdminPlayerDto> SetPhotoAsync(int id, Stream upload, long length, CancellationToken ct)
    {
        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == id, ct) ?? throw ApiProblemException.NotFound("Player");
        if (length > MaxPhotoBytes)
        {
            throw ApiProblemException.Invalid("photo", "TooLarge");
        }

        string path;
        try
        {
            await using var processed = await PhotoProcessor.ProcessAsync(upload, ct);
            // A new name per upload so browsers never show a cached old photo.
            path = await photos.SaveAsync(processed, $"player-{id}-{Guid.NewGuid():N}.jpg", ct);
        }
        catch (InvalidPhotoException ex)
        {
            throw ApiProblemException.Invalid("photo", ex.Code switch { "unsupported_format" => "UnsupportedFormat", _ => "UnreadableImage" });
        }

        var previous = player.PhotoPath;
        player.PhotoPath = path;
        await db.SaveChangesAsync(ct);

        if (previous is not null)
        {
            await photos.DeleteAsync(previous, ct);
        }

        logger.LogInformation("Player {PlayerId} photo set: {PhotoPath}", id, path);
        return await GetAsync(id, ct);
    }

    public async Task<AdminPlayerDto> DeletePhotoAsync(int id, CancellationToken ct)
    {
        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == id, ct) ?? throw ApiProblemException.NotFound("Player");
        var previous = player.PhotoPath;
        if (previous is not null)
        {
            player.PhotoPath = null;
            await db.SaveChangesAsync(ct);
            await photos.DeleteAsync(previous, ct);
            logger.LogInformation("Player {PlayerId} photo removed", id);
        }

        return await GetAsync(id, ct);
    }

    public async Task<AdminPlayerDto> GetAsync(int id, CancellationToken ct)
    {
        var player = await db.Players.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, ct) ?? throw ApiProblemException.NotFound("Player");
        var position = await db.RankingSnapshot.AsNoTracking().Where(s => s.PlayerId == id).Select(s => (int?)s.Position).FirstOrDefaultAsync(ct);
        return ToDto(player, position);
    }

    public static AdminPlayerDto ToDto(Player p, int? position) =>
        new(p.Id, p.FullName, p.Nickname, p.PhotoPath, p.Hand, p.Backhand, p.JoinedAt, p.IsActive, position);

    private async Task EnsureExistsAsync(int id, CancellationToken ct)
    {
        if (!await db.Players.AnyAsync(p => p.Id == id, ct))
        {
            throw ApiProblemException.NotFound("Player");
        }
    }

    private static Dictionary<string, string[]> ValidateFields(string? fullName, string? nickname)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(fullName))
        {
            errors["fullName"] = ["Required"];
        }
        else if (fullName.Trim().Length > 120)
        {
            errors["fullName"] = ["TooLong"];
        }

        if (nickname is not null && nickname.Trim().Length > 60)
        {
            errors["nickname"] = ["TooLong"];
        }

        return errors;
    }

    private static void ThrowIfAny(Dictionary<string, string[]> errors)
    {
        if (errors.Count > 0)
        {
            throw new ApiProblemException(StatusCodes.Status422UnprocessableEntity, "ValidationFailed", "One or more fields are invalid.", errors);
        }
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
