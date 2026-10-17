# AirClean API — MongoDB Atlas + Render

## Local run
Set environment variables first:
- `MONGODB_URI`: MongoDB Atlas connection string
- `MONGODB_DATABASE`: database name (default `aircareconnect`)
- `JWT_KEY`: secret string of at least 32 bytes

Then:
```powershell
dotnet restore
dotnet run
```

`dotnet run` listens on http://localhost:5080 (from `Properties/launchSettings.json`, which also sets `ASPNETCORE_ENVIRONMENT=Development`). When `PORT` is set, as on Render, the API listens on `0.0.0.0:$PORT` instead. Health check: `/health`.

Add `SEED_DEMO_DATA=true` to fill an empty development database with demo accounts (password `Aircare123!`; see the main README). Every other setting is listed in [docs/REFERENCE.md](../../docs/REFERENCE.md#backend-environment-variables).

## Render setup
This repository includes `render.yaml` and a Dockerfile. Connect the repository in Render and choose the Blueprint flow, or create a Docker Web Service using:
- Dockerfile path: `./backend/AirClean.Api/Dockerfile`
- Docker context: `./backend/AirClean.Api`
- Health check path: `/health`

Set `MONGODB_URI` using the connection string copied from Atlas. Add a database user and allow network access for Render in Atlas Network Access. Never commit secrets.

`render.yaml` asks for the optional secrets too (`BREVO_API_KEY`, `GOOGLE_CLIENT_ID`, `CRON_KEY`, `SLIP2GO_API_SECRET`). Leaving one empty only turns its feature off.
