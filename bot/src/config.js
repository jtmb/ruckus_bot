function load(env = process.env) {
  const need = ["BOT_TOKEN", "MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing required environment: ${missing.join(", ")}`);
  const port = env.MYSQL_PORT ? Number(env.MYSQL_PORT) : 3306;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("MYSQL_PORT must be a valid port");
  return {
    token: env.BOT_TOKEN,
    mysql: { host: env.MYSQL_HOST, port, user: env.MYSQL_USER, password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE },
    openWeatherKey: env.OPENWEATHERMAP_API_KEY || "",
  };
}
module.exports = { load };
