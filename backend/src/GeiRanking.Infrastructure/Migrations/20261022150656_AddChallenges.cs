using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace GeiRanking.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddChallenges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "challenges",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    challenger_id = table.Column<int>(type: "integer", nullable: false),
                    challenged_id = table.Column<int>(type: "integer", nullable: false),
                    issued_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    deadline_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    scheduled_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    match_id = table.Column<int>(type: "integer", nullable: true),
                    notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_challenges", x => x.id);
                    table.CheckConstraint("ck_challenges_distinct_players", "challenger_id <> challenged_id");
                    table.CheckConstraint("ck_challenges_played_has_match", "status <> 'Played' OR match_id IS NOT NULL");
                    table.ForeignKey(
                        name: "fk_challenges_matches_match_id",
                        column: x => x.match_id,
                        principalTable: "matches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_challenges_players_challenged_id",
                        column: x => x.challenged_id,
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_challenges_players_challenger_id",
                        column: x => x.challenger_id,
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_challenges_challenged_id",
                table: "challenges",
                column: "challenged_id");

            migrationBuilder.CreateIndex(
                name: "ix_challenges_challenger_id",
                table: "challenges",
                column: "challenger_id");

            migrationBuilder.CreateIndex(
                name: "ix_challenges_match_id",
                table: "challenges",
                column: "match_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_challenges_status_deadline_at",
                table: "challenges",
                columns: new[] { "status", "deadline_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "challenges");
        }
    }
}
