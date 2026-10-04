function isProduction() {
  return [
    process.env.NODE_ENV,
    process.env.RAILWAY_ENVIRONMENT,
    process.env.RAILWAY_ENVIRONMENT_NAME,
  ].some((value) => typeof value === "string" && value.toLowerCase() === "production");
}

module.exports = { isProduction };
