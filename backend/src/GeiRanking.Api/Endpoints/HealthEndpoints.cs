using GeiRanking.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace GeiRanking.Api.Endpoints;

public static class HealthEndpoints
{
    public static void MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/health", async (AppDbContext db, CancellationToken ct) =>
        {
            var serverTimeUtc = DateTimeOffset.UtcNow;
            try
            {
                await db.Database.ExecuteSqlRawAsync("SELECT 1", ct);
                return Results.Ok(new HealthResponse("ok", "ok", serverTimeUtc));
            }
            catch (Exception) when (!ct.IsCancellationRequested)
            {
                return Results.Json(new HealthResponse("degraded", "error", serverTimeUtc), statusCode: StatusCodes.Status503ServiceUnavailable);
            }
        })
        .WithName("Health")
        .WithSummary("Checks that the API is up and can reach the database.");
    }
}

public sealed record HealthResponse(string Status, string Database, DateTimeOffset ServerTimeUtc);
