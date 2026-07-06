import type { WebClient } from "@slack/web-api";

import type { AppConfig } from "../config";
import type { ReactionResolution } from "../lang/flag-map";
import { fetchMessageText } from "../slack/message";
import {
	addReactionSafe,
	removeReactionSafe,
	STATUS_REACTIONS,
} from "../slack/reactions";
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
 * - 受付直後にbot自身が処理中スタンプ（🔁）を付けて反応済みであることを示す
 * - 非対応言語: Google翻訳を介さず、その言語の定型文を本人だけに表示
 * - 対応言語: 本文取得 → 翻訳 → 押した本人だけに見える ephemeral 投稿
 * - 完了時に成功（✅）/失敗（❌）スタンプを付け、処理中スタンプを外す
 *
 * この関数は waitUntil 経由でレスポンス返却後に実行されるため、
 * エラーは握りつぶしてログのみとする（Slackにリトライさせない＝重複翻訳防止）。
 */
export async function handleReaction(
	input: HandleReactionInput,
): Promise<void> {
	const { client, cfg, channel, ts, reaction, user, resolution } = input;

	// 受付を即時に可視化する。以降の成否は finally でスタンプに反映する
	await addReactionSafe(client, channel, ts, STATUS_REACTIONS.processing);

	let succeeded = false;
	try {
		// 非対応言語: Google翻訳を介さず定型文を本人にだけ表示する
		if (resolution.kind === "unsupported") {
			await client.chat.postEphemeral({
				channel,
				user,
				text: resolution.message,
			});
			succeeded = true;

			return;
		}

		// 対応言語: 本文取得 → 翻訳 → ephemeral
		const msg = await fetchMessageText(client, channel, ts);
		if (!msg) {
			// 本文が取得できない/空（添付のみ等）→ 翻訳を届けられないため失敗扱い
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

		succeeded = true;
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
	} finally {
		// 結果スタンプを先に付けてから古いスタンプを外し、状態表示が消える瞬間を作らない
		const [resultReaction, staleReaction] = succeeded
			? [STATUS_REACTIONS.success, STATUS_REACTIONS.failure]
			: [STATUS_REACTIONS.failure, STATUS_REACTIONS.success];
		await addReactionSafe(client, channel, ts, resultReaction);
		await Promise.all([
			// 前回の実行が残した逆の結果スタンプを外す（例: 失敗→リトライ成功）
			removeReactionSafe(client, channel, ts, staleReaction),
			removeReactionSafe(client, channel, ts, STATUS_REACTIONS.processing),
		]);
	}
}
