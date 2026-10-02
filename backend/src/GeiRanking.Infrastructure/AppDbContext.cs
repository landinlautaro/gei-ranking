using Microsoft.EntityFrameworkCore;

namespace GeiRanking.Infrastructure;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
}
