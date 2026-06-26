const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";

export class TranslateError extends Error {
	constructor(
		public status: number,
		public body: string,
	) {
		super(`Google Translate API error: ${status}`);
		this.name = "TranslateError";
	}
}

type TranslateResponse = {
	data?: {
		translations?: Array<{
			translatedText?: string;
			detectedSourceLanguage?: string;
		}>;
	};
};

export type TranslateResult = {
	text: string;
	/** Googleが推定した元言語コード（例: "en"）。判定不能なら undefined */
	detectedSourceLanguage?: string;
};

/**
 * Google Cloud Translation API v2 (Basic) で1テキストを翻訳する。
 * 認証はAPIキー方式（クエリ `?key=`）。`source` は省略してGoogleの自動判定に任せる。
 */
export async function translate(opts: {
	apiKey: string;
	text: string;
	targetLang: string;
}): Promise<TranslateResult> {
	const res = await fetch(
		`${ENDPOINT}?key=${encodeURIComponent(opts.apiKey)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				q: opts.text,
				target: opts.targetLang,
				format: "text",
			}),
		},
	);

	if (!res.ok) {
		// 403=認証/キー無効, 400=パラメータ不正(未対応言語等), 429=quota超過 など
		const body = await res.text().catch(() => "");

		throw new TranslateError(res.status, body);
	}

	const data = (await res.json()) as TranslateResponse;
	const t = data.data?.translations?.[0];

	return {
		text: decodeHtmlEntities(t?.translatedText ?? ""),
		detectedSourceLanguage: t?.detectedSourceLanguage,
	};
}

/**
 * Google Translate v2 は format:"text" でも一部のHTMLエンティティ（&#39; 等）を
 * 返すことがあるため、頻出エンティティだけデコードする。
 */
function decodeHtmlEntities(s: string): string {
	return s
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}
