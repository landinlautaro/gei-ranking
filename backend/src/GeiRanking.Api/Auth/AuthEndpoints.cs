using GeiRanking.Domain.Admin;
using GeiRanking.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace GeiRanking.Api.Auth;

public sealed record LoginRequest(string? Username, string? Password);

public sealed record LoginResponse(string Token, DateTimeOffset ExpiresAt, string Username);

public sealed record MeResponse(string Username);

public static class AuthEndpoints
{
    // Verified against when the user does not exist, so both failures take the same time.
    private static readonly string DummyHash =
        new PasswordHasher<AdminUser>().HashPassword(new AdminUser { Username = "-", PasswordHash = "-" }, Guid.NewGuid().ToString("N"));

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/auth/login", Login)
            .RequireRateLimiting(AuthSetup.LoginRateLimit)
            .WithTags("Auth")
            .WithName("Login")
            .WithSummary("Returns a JWT for the admin. Send it as 'Authorization: Bearer <token>'. Logging out is discarding the token.");

        app.MapGet("/api/admin/me", (HttpContext http) => TypedResults.Ok(new MeResponse(http.User.FindFirst("name")?.Value ?? string.Empty)))
            .RequireAuthorization(AuthSetup.AdminPolicy)
            .WithTags("Auth")
            .WithName("Me")
            .WithSummary("The logged in admin; handy to check that a token is still valid.");
    }

    private static async Task<Results<Ok<LoginResponse>, ProblemHttpResult>> Login(
        LoginRequest request,
        AppDbContext db,
        IPasswordHasher<AdminUser> hasher,
        JwtTokenService tokens,
        CancellationToken ct)
    {
        var username = AdminUser.NormalizeUsername(request.Username ?? string.Empty);
        var password = request.Password ?? string.Empty;

        var user = await db.AdminUsers.FirstOrDefaultAsync(a => a.Username == username, ct);
        var result = hasher.VerifyHashedPassword(user ?? new AdminUser { Username = "-", PasswordHash = "-" }, user?.PasswordHash ?? DummyHash, password);

        if (user is null || result == PasswordVerificationResult.Failed)
        {
            return TypedResults.Problem(
                statusCode: StatusCodes.Status401Unauthorized,
                title: "Invalid credentials",
                detail: "Wrong username or password.",
                extensions: new Dictionary<string, object?> { ["code"] = "InvalidCredentials" });
        }

        if (result == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = hasher.HashPassword(user, password);
            await db.SaveChangesAsync(ct);
        }

        var (token, expiresAt) = tokens.Create(user);
        return TypedResults.Ok(new LoginResponse(token, expiresAt, user.Username));
    }
}
