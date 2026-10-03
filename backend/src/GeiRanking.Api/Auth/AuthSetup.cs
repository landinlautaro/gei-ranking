using System.Security.Cryptography;
using System.Threading.RateLimiting;
using GeiRanking.Domain.Admin;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace GeiRanking.Api.Auth;

public static class AuthSetup
{
    public const string AdminPolicy = "Admin";
    public const string LoginRateLimit = "login";

    public static IServiceCollection AddAdminAuth(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        services.AddOptions<JwtSettings>()
            .Bind(configuration.GetSection("Jwt"))
            .PostConfigure(settings =>
            {
                // Development convenience only: no secret configured -> random one, tokens die on restart.
                if (string.IsNullOrWhiteSpace(settings.Secret) && environment.IsDevelopment())
                {
                    settings.Secret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
                    settings.SecretIsEphemeral = true;
                }
            })
            .Validate(
                settings => settings.HasValidSecret,
                $"Missing or too short JWT secret. Set the Jwt__Secret environment variable ({JwtSettings.MinSecretLength}+ characters).")
            .ValidateOnStart(); // checked when the server starts, not by EF tools or maintenance commands

        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IPasswordHasher<AdminUser>, PasswordHasher<AdminUser>>();
        services.AddSingleton<JwtTokenService>();

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IOptions<JwtSettings>>((bearer, jwt) =>
            {
                var settings = jwt.Value;
                bearer.MapInboundClaims = false;
                bearer.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidIssuer = settings.Issuer,
                    ValidAudience = settings.Audience,
                    IssuerSigningKey = settings.SigningKey(),
                    ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
                    ClockSkew = TimeSpan.FromMinutes(1),
                    NameClaimType = "name",
                    RoleClaimType = "role",
                };
            });

        services.AddAuthorizationBuilder()
            .AddPolicy(AdminPolicy, policy => policy.RequireAuthenticatedUser().RequireRole(JwtTokenService.AdminRole));

        // Brute-force protection for the login endpoint: N attempts per minute per client address.
        var permitLimit = configuration.GetValue("RateLimit:LoginPermitPerMinute", 10);
        services.AddRateLimiter(limiter =>
        {
            limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            limiter.AddPolicy(LoginRateLimit, httpContext =>
                RateLimitPartition.GetFixedWindowLimiter(
                    httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions { PermitLimit = permitLimit, Window = TimeSpan.FromMinutes(1) }));
        });

        return services;
    }
}
