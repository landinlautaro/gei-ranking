using GeiRanking.Domain.Admin;
using GeiRanking.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace GeiRanking.Api.Auth;

public static class AdminSeeder
{
    public const int MinPasswordLength = 10;

    /// <summary>
    /// Creates the first admin. Never overwrites: if that username already exists nothing changes.
    /// Returns true when a user was created.
    /// </summary>
    public static async Task<bool> EnsureAdminAsync(
        AppDbContext db,
        IPasswordHasher<AdminUser> hasher,
        string? username,
        string? password,
        TimeProvider clock,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrEmpty(password))
        {
            throw new InvalidOperationException("Set the Admin__Username and Admin__Password environment variables to create the admin.");
        }

        if (password.Length < MinPasswordLength)
        {
            throw new InvalidOperationException($"Admin__Password must have at least {MinPasswordLength} characters.");
        }

        var normalized = AdminUser.NormalizeUsername(username);
        if (await db.AdminUsers.AnyAsync(a => a.Username == normalized, ct))
        {
            return false;
        }

        var user = new AdminUser { Username = normalized, PasswordHash = string.Empty, CreatedAt = clock.GetUtcNow() };
        user.PasswordHash = hasher.HashPassword(user, password);
        db.AdminUsers.Add(user);
        await db.SaveChangesAsync(ct);
        return true;
    }
}
