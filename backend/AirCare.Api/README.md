# AirCare Connect API — MongoDB Atlas + Render

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

The API uses the port supplied by Render's `PORT` variable (defaults to 10000 locally). Health check: `/health`.

## Render setup
This repository includes `render.yaml` and a Dockerfile. Connect the repository in Render and choose the Blueprint flow, or create a Docker Web Service using:
- Dockerfile path: `./backend/AirCare.Api/Dockerfile`
- Docker context: `./backend/AirCare.Api`
- Health check path: `/health`

Set `MONGODB_URI` using the connection string copied from Atlas. Add a database user and allow network access for Render in Atlas Network Access. Never commit secrets.
