# syntax=docker/dockerfile:1
# Production image of the API. Build context: this folder (backend/).
#   docker build -t gei-api ./backend
# The same image runs the maintenance commands:  docker run --rm <env> gei-api migrate | seed-admin | rebuild-ranking

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore first, with only the project files, so this layer is cached until a dependency changes.
COPY Directory.Build.props Directory.Packages.props ./
COPY src/GeiRanking.Domain/GeiRanking.Domain.csproj src/GeiRanking.Domain/
COPY src/GeiRanking.Infrastructure/GeiRanking.Infrastructure.csproj src/GeiRanking.Infrastructure/
COPY src/GeiRanking.Api/GeiRanking.Api.csproj src/GeiRanking.Api/
RUN dotnet restore src/GeiRanking.Api/GeiRanking.Api.csproj

COPY src ./src
RUN dotnet publish src/GeiRanking.Api/GeiRanking.Api.csproj -c Release -o /app --no-restore -p:UseAppHost=false


FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .

# Photos live in /data/photos: mount a persistent volume there. By default the app runs unprivileged (1654 is the
# base image's APP_UID); Docker volumes inherit that owner. Platforms that mount volumes owned by root (Fly.io) need
# --build-arg APP_USER=0 (see backend/fly.toml): the machine is an isolated VM running only this app.
ARG APP_USER=1654
RUN mkdir -p /data/photos && chown -R 1654 /data
USER ${APP_USER}

ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS=8080 \
    Storage__PhotosPath=/data/photos \
    DOTNET_gcServer=0 \
    DOTNET_EnableDiagnostics=0
# Required at runtime (see .env.example): ConnectionStrings__Default, Jwt__Secret, Cors__AllowedOrigins.
# Behind a reverse proxy / platform router set ASPNETCORE_FORWARDEDHEADERS_ENABLED=true so the client IP and scheme are right.

EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["dotnet", "GeiRanking.Api.dll"]
