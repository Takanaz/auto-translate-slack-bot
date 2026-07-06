import type { WebClient } from "@slack/web-api";

export type FetchedMessage = {
	text: string;
	/** スレッド内メッセージなら親スレッドのts。トップレベルなら undefined */
	threadTs?: string;
};

/**
 * reaction_added では本文が渡らない（item.channel / item.ts のみ）ため、
 * Web APIで元メッセージの本文を取得する。
 *
 * 1) conversations.history で該当tsを1件取得（トップレベルメッセージ向け）
 * 2) 取れない/スレッド返信の場合は conversations.replies でスレッドから該当tsを探す
 *
 * 本文が無い（添付のみ等）場合や取得失敗時は null を返す。
 */
export async function fetchMessageText(
	client: WebClient,
	channel: string,
	ts: string,
): Promise<FetchedMessage | null> {
	// 1) channel history から該当tsのメッセージを取得
	try {
		const res = await client.conversations.history({
			channel,
			latest: ts,
			inclusive: true,
			limit: 1,
		});
		const msg = res.messages?.[0];
		if (msg && msg.ts === ts && msg.text) {
			return { text: msg.text, threadTs: msg.thread_ts };
		}
	} catch (err) {
		// history で取れない場合は replies にフォールバック
		console.warn("[message] conversations.history failed", err);
	}

	// 2) スレッド返信は history に現れないことがある。replies は子tsを渡してもよい仕様。
	try {
		const res = await client.conversations.replies({ channel, ts, limit: 200 });
		const msg = res.messages?.find((m) => m.ts === ts);
		if (msg?.text) {
			return { text: msg.text, threadTs: msg.thread_ts };
		}
	} catch (err) {
		// ここでも取れなければ null（巨大スレッドの末尾返信などは取りこぼす可能性あり）
		console.error("[message] conversations.replies failed", err);
	}

	return null;
}
