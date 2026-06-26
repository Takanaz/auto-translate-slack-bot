import type { WebClient } from "@slack/web-api";

import type { AppConfig } from "../config";
import type { ReactionResolution } from "../lang/flag-map";
import { fetchMessageText } from "../slack/message";
import { translate } from "../translate/translate";

export type HandleReactionInput = {
	client: WebClient;
	cfg: AppConfig;
	/** リアクションされたメッセージのチャンネル */
	channel: string;
	/** リアクションされたメッセージのts */
	ts: string;
	/** 押された絵文字名（例: "jp"）。表示用 */
	reaction: string;
	/** リアクションを押した本人のユーザーID（ephemeralの宛先） */
	user: string;
	/** リアクションの解決結果（対応言語 or 非対応＋定型文） */
	resolution: ReactionResolution;
};

/**
 * reaction_added の裏処理本体。
 * - 非対応言語: Google翻訳を介さず、その言語の定型文を本人だけに表示
 * - 対応言語: 本文取得 → 翻訳 → 押した本人だけに見える ephemeral 投稿
 *
 * この関数は waitUntil 経由でレスポンス返却後に実行されるため、
 * エラーは握りつぶしてログのみとする（Slackにリトライさせない＝重複翻訳防止）。
 */
export async function handleReaction(
	input: HandleReactionInput,
): Promise<void> {
	const { client, cfg, channel, ts, reaction, user, resolution } = input;

	try {
		// 非対応言語: Google翻訳を介さず定型文を本人にだけ表示する
		if (resolution.kind === "unsupported") {
			await client.chat.postEphemeral({
				channel,
				user,
				text: resolution.message,
			});

			return;
		}

		// 対応言語: 本文取得 → 翻訳 → ephemeral
		const msg = await fetchMessageText(client, channel, ts);
		if (!msg) {
			// 本文が取得できない/空（添付のみ等）→ 翻訳対象なし
			return;
		}

		const result = await translate({
			apiKey: cfg.googleTranslateApiKey,
			text: msg.text,
			targetLang: resolution.lang,
		});
		if (!result.text) return;

		await client.chat.postEphemeral({
			channel,
			user, // ★リアクションを押した本人だけに表示
			thread_ts: msg.threadTs, // スレッド内メッセージなら同スレッドに出す
			text: `:${reaction}: 翻訳結果:\n${result.text}`,
		});
	} catch (err) {
		console.error("[handle-reaction] failed", err);
		// 失敗時は本人にだけ簡単な通知を出す（ベストエフォート）
		try {
			await client.chat.postEphemeral({
				channel,
				user,
				text: ":warning: 翻訳に失敗しました。しばらくしてからもう一度お試しください。",
			});
		} catch {
			// ephemeral自体の失敗はこれ以上扱わない
		}
	}
}
