// Metro bundles the app. companion-server/ is a separate Node project with its own
// node_modules (and your secrets in its .env.local), so it is kept out of the app bundle.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
const companion = path.resolve(__dirname, "companion-server").replace(/[/\\]/g, "[/\\\\]");
config.resolver.blockList = [new RegExp(`^${companion}[/\\\\].*`)];

module.exports = config;
