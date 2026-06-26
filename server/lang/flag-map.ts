/**
 * 国旗絵文字（Slackのreactionフィールドの絵文字「名」）→ 翻訳先言語コードのマッピング、
 * および翻訳対応可否・非対応時の定型文を管理する。
 *
 * Slackの `reaction_added` の `reaction` は絵文字名で渡る（例: "jp", "flag-vn", "us"）。
 * 主要国は短縮名（"jp"）と "flag-xx" 形式の両方で登録する（表記揺れ吸収）。
 */

/** Google翻訳を実行する対応言語コード。ここに無い言語は定型文で案内する。 */
export const SUPPORTED_LANGS = new Set(["vi", "ja", "en"]);

/**
 * 国コード（ISO 3166-1 alpha-2 相当の絵文字名）→ 言語コード。
 * "xx" と "flag-xx" の両方のキーに展開して使う（buildFlagMap）。
 *
 * 国旗を追加したいときはこのテーブルに1行足す。
 * その言語が非対応なら UNSUPPORTED_MESSAGES に定型文も足すとよい（無ければ英語にフォールバック）。
 */
const COUNTRY_TO_LANG: Record<string, string> = {
	// --- 対応言語（Google翻訳を実行） ---
	vn: "vi",
	jp: "ja",
	us: "en",
	gb: "en",
	// --- 非対応（定型文で案内する言語） ---
	cn: "zh",
	tw: "zh", // 繁体だが定型文はzh(簡体)で代用
	hk: "zh",
	kr: "ko",
	fr: "fr",
	de: "de",
	es: "es",
	it: "it",
	pt: "pt",
	br: "pt",
	ru: "ru",
	th: "th",
	id: "id",
	nl: "nl",
	tr: "tr",
	sa: "ar",
	ae: "ar",
	eg: "ar",
	pl: "pl",
	in: "hi",
};

/** "xx" と "flag-xx" の両方を受け付けるマップを構築する */
function buildFlagMap(): Record<string, string> {
	const map: Record<string, string> = {};
	for (const [country, lang] of Object.entries(COUNTRY_TO_LANG)) {
		map[country] = lang;
		map[`flag-${country}`] = lang;
	}
	// 英語の追加エイリアス
	map["uk"] = "en";
	return map;
}

const FLAG_TO_LANG = buildFlagMap();

/**
 * 非対応言語が押されたときに表示する定型文（その言語で）。
 * Google翻訳を介さずそのまま表示する。
 * ここに無い言語は英語の定型文（UNSUPPORTED_FALLBACK）にフォールバックする。
 *
 * 原文（日本語）: 「翻訳をご希望ですか？現在このbotではご指定の言語への翻訳に対応しておりません。」
 */
const UNSUPPORTED_MESSAGES: Record<string, string> = {
	zh: "需要翻译吗？本机器人目前不支持翻译成您所选择的语言。",
	ko: "번역을 원하시나요? 현재 이 봇은 선택하신 언어로의 번역을 지원하지 않습니다.",
	fr: "Souhaitez-vous une traduction ? Ce bot ne prend pas en charge la traduction vers la langue sélectionnée pour le moment.",
	de: "Möchten Sie eine Übersetzung? Dieser Bot unterstützt die Übersetzung in die ausgewählte Sprache derzeit nicht.",
	es: "¿Desea una traducción? Actualmente este bot no admite la traducción al idioma seleccionado.",
	it: "Desideri una traduzione? Al momento questo bot non supporta la traduzione nella lingua selezionata.",
	pt: "Deseja uma tradução? Este bot ainda não oferece suporte à tradução para o idioma selecionado.",
	ru: "Хотите перевод? Этот бот пока не поддерживает перевод на выбранный вами язык.",
	th: "ต้องการการแปลหรือไม่? ขณะนี้บอทนี้ยังไม่รองรับการแปลเป็นภาษาที่คุณเลือก",
	id: "Apakah Anda ingin terjemahan? Bot ini saat ini belum mendukung terjemahan ke bahasa yang Anda pilih.",
	nl: "Wilt u een vertaling? Deze bot ondersteunt momenteel geen vertaling naar de geselecteerde taal.",
	tr: "Çeviri ister misiniz? Bu bot şu anda seçtiğiniz dile çeviriyi desteklemiyor.",
	ar: "هل ترغب في الترجمة؟ لا يدعم هذا البوت حاليًا الترجمة إلى اللغة التي اخترتها.",
	pl: "Czy chcesz przetłumaczyć tę wiadomość? Ten bot nie obsługuje obecnie tłumaczenia na wybrany język.",
	hi: "क्या आप अनुवाद चाहते हैं? यह बॉट वर्तमान में आपकी चुनी हुई भाषा में अनुवाद का समर्थन नहीं करता।",
};

/** 定型文が用意されていない非対応言語向けの英語フォールバック */
const UNSUPPORTED_FALLBACK =
	"Would you like a translation? This bot does not currently support translation into the language you selected.";

export type ReactionResolution =
	| { kind: "supported"; lang: string }
	| { kind: "unsupported"; lang: string; message: string };

/**
 * リアクション名を解決する。
 * - 対応言語の国旗 → { kind: "supported", lang }（Google翻訳を実行）
 * - 非対応言語の国旗 → { kind: "unsupported", lang, message }（定型文を表示）
 * - 国旗でない/未登録の絵文字 → null（何もしない）
 */
export function resolveReaction(reaction: string): ReactionResolution | null {
	// "jp::skin-tone-2" のようなバリアント表記から基底名を取り出す（防御的）
	const base = reaction.split("::")[0];
	const lang = FLAG_TO_LANG[base];
	if (!lang) return null;

	if (SUPPORTED_LANGS.has(lang)) {
		return { kind: "supported", lang };
	}

	return {
		kind: "unsupported",
		lang,
		message: UNSUPPORTED_MESSAGES[lang] ?? UNSUPPORTED_FALLBACK,
	};
}
