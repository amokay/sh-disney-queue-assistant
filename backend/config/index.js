export const config = {
  PORT: process.env.PORT || 3000,
  DB_PATH: "./db/disney.db",
  WAITTIME_UPDATE_INTERVAL: "*/5 * * * *",
  CORS_ORIGIN: "http://localhost:5500",
};
