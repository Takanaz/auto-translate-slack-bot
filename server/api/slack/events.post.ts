import type { H3Event } from "h3";
import { defineEventHandler } from "h3";

import { getSlackApp } from "../../bot";

export default defineEventHandler(async (event: H3Event) => {
	const { receiver } = getSlackApp();

	// Bolt(HTTPReceiver) が生のreq/resを使って署名検証・URL検証・イベント処理を行う。
	// requestListener は同期的にreturnし、レスポンスは非同期に書き込まれるため、
	// h3が先にハンドラを終了して独自レスポンスを返さないよう res の完了を待つ
	await new Promise<void>((resolve, reject) => {
		event.node.res.once("finish", resolve);
		event.node.res.once("close", resolve);
		try {
			receiver.requestListener(event.node.req, event.node.res);
		} catch (err) {
			reject(err);
		}
	});
});
