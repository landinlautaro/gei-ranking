using GeiRanking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace GeiRanking.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // Env var: ConnectionStrings__Default. Neon needs "SSL Mode=Require" in the value itself.
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException(
                "Missing connection string. Set the ConnectionStrings__Default environment variable (see .env.example).");

        // Npgsql probes for Kerberos (GSS) encryption on Linux and prints an error when libgssapi is not installed, as in
        // slim container images. This app never uses it (nor does Neon), so it is switched off unless the value says otherwise.
        if (!connectionString.Replace(" ", string.Empty).Contains("GssEncryptionMode", StringComparison.OrdinalIgnoreCase))
        {
            connectionString = new NpgsqlConnectionStringBuilder(connectionString) { GssEncryptionMode = GssEncryptionMode.Disable }.ConnectionString;
        }

        services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString, npgsql =>
        {
            // Neon scales to zero: the first connection after idle can take a few seconds or fail transiently.
            npgsql.EnableRetryOnFailure(maxRetryCount: 5, maxRetryDelay: TimeSpan.FromSeconds(10), errorCodesToAdd: null);
            npgsql.CommandTimeout(30);
        }).UseSnakeCaseNamingConvention());

        services.AddScoped<RankingService>();

        return services;
    }
}
