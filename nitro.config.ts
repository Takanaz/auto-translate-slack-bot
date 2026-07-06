import { defineNitroConfig } from "nitropack/config";

export default defineNitroConfig({
	// Vercelにデプロイする前提
	preset: "vercel",
	// standalone Nitroのデフォルトはルート直下のapi/をスキャンするため、
	// server/api/ 配下を認識させるにはsrcDirの指定が必須
	srcDir: "server",
	compatibilityDate: "2025-12-30",
	routeRules: {
		"/api/slack/**": { cors: true },
	},
});
