import { defineNitroConfig } from "nitropack/config";

export default defineNitroConfig({
	// Vercelにデプロイする前提
	preset: "vercel",
	compatibilityDate: "2025-12-30",
	routeRules: {
		"/api/slack/**": { cors: true },
	},
});
