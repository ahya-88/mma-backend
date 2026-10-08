function isProduction() {
  return process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT === "production";
}

function isDevelopment() {
  return process.env.NODE_ENV === "development" || !process.env.NODE_ENV;
}

function isTest() {
  return process.env.NODE_ENV === "test";
}

module.exports = {
  isProduction,
  isDevelopment,
  isTest,
};
