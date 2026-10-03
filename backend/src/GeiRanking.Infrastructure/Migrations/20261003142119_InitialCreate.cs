using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace GeiRanking.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "players",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    full_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    nickname = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    photo_path = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    hand = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    backhand = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    joined_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_players", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "matches",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    played_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    challenger_id = table.Column<int>(type: "integer", nullable: false),
                    challenged_id = table.Column<int>(type: "integer", nullable: false),
                    score = table.Column<string>(type: "jsonb", nullable: false),
                    completion = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    winner_id = table.Column<int>(type: "integer", nullable: false),
                    notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    challenger_position_before = table.Column<int>(type: "integer", nullable: true),
                    challenger_position_after = table.Column<int>(type: "integer", nullable: true),
                    challenged_position_before = table.Column<int>(type: "integer", nullable: true),
                    challenged_position_after = table.Column<int>(type: "integer", nullable: true),
                    movement_text = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    warning = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_matches", x => x.id);
                    table.CheckConstraint("ck_matches_distinct_players", "challenger_id <> challenged_id");
                    table.CheckConstraint("ck_matches_winner_is_a_player", "winner_id IN (challenger_id, challenged_id)");
                    table.ForeignKey(
                        name: "fk_matches_players_challenged_id",
                        column: x => x.challenged_id,
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_matches_players_challenger_id",
                        column: x => x.challenger_id,
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_matches_players_winner_id",
                        column: x => x.winner_id,
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ranking_snapshot",
                columns: table => new
                {
                    position = table.Column<int>(type: "integer", nullable: false),
                    player_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ranking_snapshot", x => x.position);
                    table.ForeignKey(
                        name: "fk_ranking_snapshot_players_player_id",
                        column: x => x.player_id,
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ranking_events",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    kind = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    occurred_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    match_id = table.Column<int>(type: "integer", nullable: true),
                    player_id = table.Column<int>(type: "integer", nullable: true),
                    position = table.Column<int>(type: "integer", nullable: true),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    initial_order = table.Column<int[]>(type: "integer[]", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ranking_events", x => x.id);
                    table.ForeignKey(
                        name: "fk_ranking_events_matches_match_id",
                        column: x => x.match_id,
                        principalTable: "matches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_ranking_events_players_player_id",
                        column: x => x.player_id,
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ranking_history",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    event_id = table.Column<long>(type: "bigint", nullable: false),
                    player_id = table.Column<int>(type: "integer", nullable: false),
                    occurred_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    from_position = table.Column<int>(type: "integer", nullable: true),
                    to_position = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ranking_history", x => x.id);
                    table.ForeignKey(
                        name: "fk_ranking_history_players_player_id",
                        column: x => x.player_id,
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_ranking_history_ranking_events_event_id",
                        column: x => x.event_id,
                        principalTable: "ranking_events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_matches_challenged_id",
                table: "matches",
                column: "challenged_id");

            migrationBuilder.CreateIndex(
                name: "ix_matches_challenger_id",
                table: "matches",
                column: "challenger_id");

            migrationBuilder.CreateIndex(
                name: "ix_matches_played_at",
                table: "matches",
                column: "played_at");

            migrationBuilder.CreateIndex(
                name: "ix_matches_winner_id",
                table: "matches",
                column: "winner_id");

            migrationBuilder.CreateIndex(
                name: "ix_ranking_events_match_id",
                table: "ranking_events",
                column: "match_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_ranking_events_occurred_at_created_at_id",
                table: "ranking_events",
                columns: new[] { "occurred_at", "created_at", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_ranking_events_player_id",
                table: "ranking_events",
                column: "player_id");

            migrationBuilder.CreateIndex(
                name: "ix_ranking_history_event_id",
                table: "ranking_history",
                column: "event_id");

            migrationBuilder.CreateIndex(
                name: "ix_ranking_history_player_id_occurred_at_id",
                table: "ranking_history",
                columns: new[] { "player_id", "occurred_at", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_ranking_snapshot_player_id",
                table: "ranking_snapshot",
                column: "player_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ranking_history");

            migrationBuilder.DropTable(
                name: "ranking_snapshot");

            migrationBuilder.DropTable(
                name: "ranking_events");

            migrationBuilder.DropTable(
                name: "matches");

            migrationBuilder.DropTable(
                name: "players");
        }
    }
}
