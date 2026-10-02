using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace GeiRanking.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // Env var: ConnectionStrings__Default. Neon needs "SSL Mode=Require" in the value itself.
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException(
                "Missing connection string. Set the ConnectionStrings__Default environment variable (see .env.example).");

        services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString, npgsql =>
        {
            // Neon scales to zero: the first connection after idle can take a few seconds or fail transiently.
            npgsql.EnableRetryOnFailure(maxRetryCount: 5, maxRetryDelay: TimeSpan.FromSeconds(10), errorCodesToAdd: null);
            npgsql.CommandTimeout(30);
        }));

        return services;
    }
}
