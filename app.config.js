// Lets a hosted web build live under a sub-path (e.g. GitHub Pages: EXPO_BASE_URL=/ai-dinner).
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_URL || undefined },
});
