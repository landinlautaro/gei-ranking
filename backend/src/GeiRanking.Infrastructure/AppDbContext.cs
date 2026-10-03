using System.Text.Json;
using GeiRanking.Domain.Matches;
using GeiRanking.Domain.Players;
using GeiRanking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace GeiRanking.Infrastructure;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    private static readonly JsonSerializerOptions ScoreJson = new(JsonSerializerDefaults.Web);

    public DbSet<Player> Players => Set<Player>();

    public DbSet<Match> Matches => Set<Match>();

    public DbSet<StoredRankingEvent> RankingEvents => Set<StoredRankingEvent>();

    public DbSet<RankingSnapshotEntry> RankingSnapshot => Set<RankingSnapshotEntry>();

    public DbSet<RankingHistoryEntry> RankingHistory => Set<RankingHistoryEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Player>(e =>
        {
            e.ToTable("players");
            e.Property(p => p.FullName).HasMaxLength(120);
            e.Property(p => p.Nickname).HasMaxLength(60);
            e.Property(p => p.PhotoPath).HasMaxLength(300);
            e.Property(p => p.Hand).HasConversion<string>().HasMaxLength(20);
            e.Property(p => p.Backhand).HasConversion<string>().HasMaxLength(20);
        });

        modelBuilder.Entity<Match>(e =>
        {
            e.ToTable("matches", t =>
            {
                t.HasCheckConstraint("ck_matches_distinct_players", "challenger_id <> challenged_id");
                t.HasCheckConstraint("ck_matches_winner_is_a_player", "winner_id IN (challenger_id, challenged_id)");
            });

            // Sets live in a jsonb column: they are always read and written together with their match and never
            // queried on their own, so a child table would only add joins and a second thing to keep in sync.
            e.Property(m => m.Score)
                .HasColumnType("jsonb")
                .HasConversion(
                    score => JsonSerializer.Serialize(score, ScoreJson),
                    json => JsonSerializer.Deserialize<MatchScore>(json, ScoreJson)!,
                    new ValueComparer<MatchScore>(
                        (a, b) => JsonSerializer.Serialize(a, ScoreJson) == JsonSerializer.Serialize(b, ScoreJson),
                        score => JsonSerializer.Serialize(score, ScoreJson).GetHashCode(),
                        score => JsonSerializer.Deserialize<MatchScore>(JsonSerializer.Serialize(score, ScoreJson), ScoreJson)!));

            e.Property(m => m.Completion).HasConversion<string>().HasMaxLength(20);
            e.Property(m => m.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(m => m.Warning).HasConversion<string>().HasMaxLength(40);
            e.Property(m => m.Notes).HasMaxLength(1000);
            e.Property(m => m.MovementText).HasMaxLength(500);

            e.HasOne<Player>().WithMany().HasForeignKey(m => m.ChallengerId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Player>().WithMany().HasForeignKey(m => m.ChallengedId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Player>().WithMany().HasForeignKey(m => m.WinnerId).OnDelete(DeleteBehavior.Restrict);

            e.HasIndex(m => m.ChallengerId);
            e.HasIndex(m => m.ChallengedId);
            e.HasIndex(m => m.PlayedAt);
        });

        modelBuilder.Entity<StoredRankingEvent>(e =>
        {
            e.ToTable("ranking_events");
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(30);
            e.Property(x => x.Reason).HasMaxLength(500);
            e.Property(x => x.InitialOrder).HasColumnType("integer[]");

            e.HasOne(x => x.Match).WithMany().HasForeignKey(x => x.MatchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Player).WithMany().HasForeignKey(x => x.PlayerId).OnDelete(DeleteBehavior.Restrict);

            // Replay order: date, then creation, then id.
            e.HasIndex(x => new { x.OccurredAt, x.CreatedAt, x.Id });
            e.HasIndex(x => x.MatchId).IsUnique();
        });

        modelBuilder.Entity<RankingSnapshotEntry>(e =>
        {
            e.ToTable("ranking_snapshot");
            e.HasKey(x => x.Position);
            e.Property(x => x.Position).ValueGeneratedNever();
            e.HasIndex(x => x.PlayerId).IsUnique();
            e.HasOne(x => x.Player).WithMany().HasForeignKey(x => x.PlayerId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<RankingHistoryEntry>(e =>
        {
            e.ToTable("ranking_history");
            e.HasOne<StoredRankingEvent>().WithMany().HasForeignKey(x => x.EventId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<Player>().WithMany().HasForeignKey(x => x.PlayerId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.PlayerId, x.OccurredAt, x.Id });
        });
    }
}
