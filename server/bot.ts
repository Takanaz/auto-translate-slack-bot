import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { App, HTTPReceiver } from "@slack/bolt";
import { waitUntil } from "@vercel/functions";

import { getConfig } from "./config";
import { handleReaction } from "./domain/handle-reaction";
import { resolveReaction } from "./lang/flag-map";

let _app: App | null = null;
let _receiver: HTTPReceiver | null = null;

export function getSlackApp() {
	if (_app && _receiver) return { app: _app, receiver: _receiver };

	const cfg = getConfig();
	const receiver = new HTTPReceiver({
		signingSecret: cfg.slackSigningSecret,
		processBeforeResponse: true,
		// HTTPReceiverのデフォルトは "/slack/events"。
		// このアプリのルート(/api/slack/events)と一致しないと例外を投げるため明示する
		endpoints: "/api/slack/events",
	});

	const app = new App({
		token: cfg.slackBotToken,
		receiver,
	});

	// 国旗リアクションで翻訳する本体
	app.event(
		"reaction_added",
		async ({
			event,
			client,
		}: SlackEventMiddlewareArgs<"reaction_added"> & AllMiddlewareArgs) => {
			// --- 同期的な早期フィルタ（ここで弾けるものは裏処理に回さない） ---
			// メッセージ以外（ファイル等）へのリアクションは対象外
			if (event.item.type !== "message") return;
			// 対象チャンネル以外は無視（複数指定対応）
			if (!cfg.targetChannelIds.has(event.item.channel)) return;
			// bot自身が付けたリアクションは無視（無限ループ防止）
			if (cfg.botUserId && event.user === cfg.botUserId) return;
			// 国旗以外/未登録の絵文字は無視
			const resolution = resolveReaction(event.reaction);
			if (!resolution) return;

			// --- 重い処理（本文取得→翻訳→ephemeral）は waitUntil に逃がす ---
			// リスナーを即returnさせることで processEvent が即完了し、
			// HTTPReceiver が3秒以内に 200 を返す（Slackの再送＝重複翻訳を防ぐ）。
			runInBackground(
				handleReaction({
					client,
					cfg,
					channel: event.item.channel,
					ts: event.item.ts,
					reaction: event.reaction,
					user: event.user,
					resolution,
				}),
			);
		},
	);

	_app = app;
	_receiver = receiver;

	return { app, receiver };
}

/**
 * バックグラウンド処理をVercelサーバーレス関数の生存期間に紐付ける。
 * Vercel上では waitUntil がレスポンス返却後も関数を延命してPromise完了まで待つ。
 * ローカル(nitro dev)などランタイム外では waitUntil が例外を投げうるため、
 * その場合は投げっぱなしにする（サーバープロセスは生き続けるので完了する）。
 */
function runInBackground(promise: Promise<void>): void {
	try {
		waitUntil(promise);
	} catch {
		void promise.catch((e) => console.error("[bot] background task failed", e));
	}
}
