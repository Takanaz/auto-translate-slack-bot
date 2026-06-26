import type { H3Event } from "h3";
import { defineEventHandler } from "h3";

import { getSlackApp } from "../../bot";

export default defineEventHandler(async (event: H3Event) => {
	const { receiver } = getSlackApp();

	// Bolt(HTTPReceiver) が生のreq/resを使って署名検証・URL検証・イベント処理を行う
	await receiver.requestListener(event.node.req, event.node.res);

	// response は receiver が書き込むため、ここでは何も返さない
	return;
});
