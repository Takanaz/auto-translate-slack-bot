export type AppConfig = {
	slackBotToken: string;
	slackSigningSecret: string;
	/** bot自身が付けたリアクションを無視するために使用（任意）。例: "U0123456789" */
	botUserId?: string;
	/** 国旗リアクションに反応する対象チャンネルの集合（複数指定可）。例: "C0123456789" */
	targetChannelIds: Set<string>;
	/** Google Cloud Translation API v2 用APIキー */
	googleTranslateApiKey: string;
};

function requireEnv(name: string) {
	const v = process.env[name];
	if (!v) throw new Error(`Missing required env: ${name}`);
	return v;
}

function parseChannelIds(): Set<string> {
	// カンマ区切りで複数のチャンネルIDを指定できる（例: "C0123456789,C0987654321"）
	const raw = requireEnv("TARGET_CHANNEL_IDS");
	const ids = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (ids.length === 0) {
		throw new Error("TARGET_CHANNEL_IDS must contain at least one channel id");
	}
	return new Set(ids);
}

export function getConfig(): AppConfig {
	return {
		slackBotToken: requireEnv("SLACK_BOT_TOKEN"),
		slackSigningSecret: requireEnv("SLACK_SIGNING_SECRET"),
		botUserId: process.env.SLACK_BOT_USER_ID,
		targetChannelIds: parseChannelIds(),
		googleTranslateApiKey: requireEnv("GOOGLE_TRANSLATE_API_KEY"),
	};
}
