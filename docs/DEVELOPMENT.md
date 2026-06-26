# 開発者向けガイド

## 技術スタック

- TypeScript (ES2022) / Node 24 / pnpm
- [Nitro](https://nitro.build/)（`preset: "vercel"`、ファイルベースルーティング）
- [@slack/bolt](https://slack.dev/bolt-js/)（`HTTPReceiver`、Socket Modeは未使用）
- [@vercel/functions](https://www.npmjs.com/package/@vercel/functions)（`waitUntil`）
- Google Cloud Translation API v2（fetch直叩き、SDK不使用）

## ディレクトリ構成

```
server/
├─ config.ts                  # 環境変数パース
├─ bot.ts                     # Bolt App/Receiver シングルトン + reaction_added リスナー + waitUntil
├─ lang/flag-map.ts           # 国旗絵文字名 → 言語コード のマッピング
├─ translate/translate.ts     # Google Cloud Translation v2 fetchラッパ
├─ slack/message.ts           # 元メッセージ本文取得（history → replies フォールバック）
├─ domain/handle-reaction.ts  # 裏処理本体（本文取得→翻訳→ephemeral投稿）
└─ api/slack/events.post.ts   # Slack Events 受け口
```

## ローカル開発

```bash
pnpm i
pnpm run dev        # nitro dev
pnpm run typecheck  # tsc --noEmit
```

ローカルでSlackイベントを受けるには、`nitro dev` の公開URL（ngrok等でトンネル）を Slack App の Request URL に設定します。

> `@vercel/functions` の `waitUntil` はVercelランタイム外（ローカル）では延命機能が働きませんが、`nitro dev` のサーバープロセスは起動し続けるため、裏処理はそのまま完了します（`bot.ts` の `runInBackground` がフォールバック）。

## デプロイ

`.github/workflows/deploy-vercel.yml` により、`develop` ブランチへの push で Vercel 本番デプロイされます。以下のGitHub Secretsが必要です。

- `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` / `VERCEL_TOKEN`

Vercel側のEnvironment Variablesに `.env.example` の各変数を設定してください。

## 環境変数

[`.env.example`](../.env.example) を参照。

| 変数                       | 必須 | 説明                                                 |
| -------------------------- | ---- | ---------------------------------------------------- |
| `SLACK_BOT_TOKEN`          | ✅   | Bot User OAuth Token（`xoxb-...`）                   |
| `SLACK_SIGNING_SECRET`     | ✅   | リクエスト署名検証用                                 |
| `SLACK_BOT_USER_ID`        | 任意 | bot自身のリアクションを無視するため                  |
| `TARGET_CHANNEL_IDS`       | ✅   | 反応する対象チャンネルID（カンマ区切りで複数指定可） |
| `GOOGLE_TRANSLATE_API_KEY` | ✅   | Google Cloud Translation v2 用APIキー                |

## 国旗・言語の追加と対応可否

すべて `server/lang/flag-map.ts` で管理します。

- **国旗→言語の対応**: `COUNTRY_TO_LANG` に「国コード → 言語コード(ISO-639)」を追加。`xx` と `flag-xx` の両形式は自動で展開されるため、`kr: "ko"` のように国コードだけ書けば `:kr:` `:flag-kr:` 両方に反応します。
- **翻訳を有効にする**: その言語コードを `SUPPORTED_LANGS` に追加すると、Google翻訳が実行されます。
- **未対応のまま案内文だけ出す**: `SUPPORTED_LANGS` に入れず、`UNSUPPORTED_MESSAGES` にその言語の定型文を追加します（無い場合は英語の定型文 `UNSUPPORTED_FALLBACK` にフォールバック）。

```ts
// 例: 韓国語を「翻訳対応」にする場合
export const SUPPORTED_LANGS = new Set(["vi", "ja", "en", "ko"]);
const COUNTRY_TO_LANG: Record<string, string> = {
  // ...
  kr: "ko",
};

// 例: ドイツ語は「未対応のまま案内文だけ」にする場合
// SUPPORTED_LANGS には入れず、定型文だけ用意する
const UNSUPPORTED_MESSAGES: Record<string, string> = {
  de: "Möchten Sie eine Übersetzung? ...",
};
```

### 処理の分岐

`resolveReaction(reaction)` が次の3値を返し、`handle-reaction.ts` がそれぞれ処理します。

- `{ kind: "supported", lang }` … Google翻訳を実行してephemeral表示
- `{ kind: "unsupported", lang, message }` … 翻訳せず定型文をそのままephemeral表示
- `null` … 国旗以外/未登録の絵文字。何もしない

## 設計上のポイント

- **3秒ACK**: `reaction_added` のリスナーは早期フィルタ後すぐにreturnし、重い処理（翻訳）は `waitUntil` に載せる。これによりSlackの再送（重複翻訳）を防ぐ。
- **重複防止**: 裏処理（`handleReaction`）のエラーは握りつぶしてログのみ。Slackにエラーを返してリトライさせない。
- **本文取得**: `reaction_added` に本文は含まれないため `conversations.history` で取得。スレッド返信は `conversations.replies` でフォールバック。
- **元言語**: Google翻訳の自動判定に任せる（`source` 省略）。

## 既知の制約

- ephemeralメッセージは本人にしか見えず、リロードで消える。検索・編集・共有不可。
- 巨大スレッドの末尾の返信は本文取得で取りこぼす可能性がある（`replies` の取得上限）。
- Google Translate v2 はNMTモデルで、文脈考慮はLLMより弱い。
