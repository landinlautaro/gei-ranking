using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace GeiRanking.Api.Auth;

/// <summary>JWT configuration. Env vars: Jwt__Secret (required in production, 32+ characters), Jwt__Issuer, Jwt__Audience, Jwt__ExpiresMinutes.</summary>
public sealed class JwtSettings
{
    public const int MinSecretLength = 32;

    public string? Secret { get; set; }

    public string Issuer { get; set; } = "gei-ranking";

    public string Audience { get; set; } = "gei-ranking-admin";

    public int ExpiresMinutes { get; set; } = 480;

    /// <summary>True when no secret was configured and a random one was generated (Development only): tokens die on restart.</summary>
    public bool SecretIsEphemeral { get; set; }

    public bool HasValidSecret => !string.IsNullOrWhiteSpace(Secret) && Secret.Length >= MinSecretLength;

    public SymmetricSecurityKey SigningKey() =>
        HasValidSecret
            ? new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret!))
            : throw new InvalidOperationException(
                $"Missing or too short JWT secret. Set the Jwt__Secret environment variable ({MinSecretLength}+ characters).");
}
