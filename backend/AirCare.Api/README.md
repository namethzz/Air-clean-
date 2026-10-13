# AirCare Connect API (V.1)

ASP.NET Core 8 Web API + EF Core + SQLite. Database is created and seeded on the first run.

```powershell
dotnet restore
dotnet run
```

API root: http://localhost:5080 · Health check: http://localhost:5080/health

Demo accounts (all passwords: `Aircare123!`):
- `customer@aircare.demo`
- `technician@aircare.demo`
- `manager@aircare.demo`
- `admin@aircare.demo`

The JWT key and seeded accounts are for local development only. Replace them and use secret configuration before deploying.