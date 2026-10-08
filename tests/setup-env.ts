process.env.DATABASE_URL =
  "postgresql://cobyshelton@localhost:5432/tasks_app_test?schema=public";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-123456";
process.env.JWT_EXPIRES_IN = "1h";
process.env.PORT = "0";
process.env.CORS_ORIGIN = "http://localhost:5173";
