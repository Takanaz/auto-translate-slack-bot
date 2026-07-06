import type { WebClient } from "@slack/web-api";

/** 処理状態を表すbot自身のリアクション名 */
export const STATUS_REACTIONS = {
	/** 受付済み・処理中 */
	processing: "repeat",
	/** 正常完了（翻訳 or 定型文を届けた） */
	success: "white_check_mark",
	/** 失敗（本文取得不可・翻訳結果なし・例外） */
	failure: "x",
} as const;

/**
 * リアクションを付ける。すでに付いている場合の `already_reacted` は正常扱い。
 * 状態表示はベストエフォートのため、その他のエラーもログのみで本処理を止めない。
 */
export async function addReactionSafe(
	client: WebClient,
	channel: string,
	ts: string,
	name: string,
): Promise<void> {
	try {
		await client.reactions.add({ channel, timestamp: ts, name });
	} catch (err) {
		if (isSlackError(err, "already_reacted")) return;
		console.error(`[reactions] add :${name}: failed`, err);
	}
}

/**
 * リアクションを外す。付いていない場合の `no_reaction` は正常扱い。
 * その他のエラーもログのみで本処理を止めない。
 */
export async function removeReactionSafe(
	client: WebClient,
	channel: string,
	ts: string,
	name: string,
): Promise<void> {
	try {
		await client.reactions.remove({ channel, timestamp: ts, name });
	} catch (err) {
		if (isSlackError(err, "no_reaction")) return;

		console.error(`[reactions] remove :${name}: failed`, err);
	}
}

/** Slack Web APIのエラーコード（data.error）が指定のものか判定する */
function isSlackError(err: unknown, code: string): boolean {
	if (typeof err !== "object" || err === null) return false;

	const data = (err as { data?: { error?: string } }).data;

	return data?.error === code;
}
