# auto-translate-slack-bot

指定したSlackチャンネルで、メッセージに**国旗の絵文字リアクション**を付けると、その国の言語に翻訳し、**リアクションを押した本人だけに見える形（ephemeral）** で翻訳結果を表示するBotです。

## 仕組み

- **Slack 受信**: `POST /api/slack/events`（Slack Events API / `reaction_added`）
- **対象**: `TARGET_CHANNEL_IDS` で指定したチャンネルのメッセージのみ（カンマ区切りで複数指定可）
- **翻訳**: Google Cloud Translation API v2（Basic）
- **表示**: `chat.postEphemeral` で押した本人だけに表示

### 翻訳に対応する国旗（Google翻訳を実行）

| リアクション          | 言語            |
| --------------------- | --------------- |
| 🇻🇳 `:flag-vn:`        | ベトナム語 (vi) |
| 🇯🇵 `:jp:`             | 日本語 (ja)     |
| 🇺🇸 `:us:` / 🇬🇧 `:gb:` | 英語 (en)       |

### 非対応言語の国旗を押した場合

主要国の国旗（🇨🇳🇰🇷🇫🇷🇩🇪🇪🇸🇮🇹🇵🇹🇧🇷🇷🇺🇹🇭🇮🇩🇳🇱🇹🇷🇸🇦🇵🇱🇮🇳 など）も認識します。これらの**未対応言語**の国旗が押されたときは、Google翻訳を呼ばずに**その言語の定型文**「翻訳をご希望ですか？現在このbotではご指定の言語への翻訳に対応しておりません。」を本人だけに表示します。国旗以外の絵文字（👍❤️など）には反応しません。

言語の追加・変更は [`server/lang/flag-map.ts`](server/lang/flag-map.ts) で行います。

- 翻訳対応にする言語コードは `SUPPORTED_LANGS` に追加
- 国旗→言語の対応は `COUNTRY_TO_LANG`（`xx` と `flag-xx` の両形式を自動展開）
- 未対応言語の定型文は `UNSUPPORTED_MESSAGES`（無い言語は英語にフォールバック）

## 処理フロー（3秒ACK対策）

Slackはイベントに3秒以内のHTTP 200を要求します。翻訳＋投稿は数秒かかるため、即ACKしてから裏で翻訳します。

1. `reaction_added` を受信 → Boltリスナーで早期フィルタ（対象チャンネル群/国旗マッピング/bot自身）
2. 重い処理（本文取得→翻訳→ephemeral投稿、非対応言語は定型文）を `@vercel/functions` の `waitUntil` に載せ、リスナーは即return
3. HTTPReceiver が3秒以内に 200 を返す（Slackの再送＝重複翻訳を防止）
4. レスポンス返却後も Vercel関数が生存し、裏処理が完了

## セットアップ（ローカル）

```bash
pnpm i
pnpm run dev
```

`docs/USAGE.md`（利用者向け）・`docs/DEVELOPMENT.md`（開発者向け）も参照してください。

## Slack App 側の設定メモ

- Request URL: `https://<your-domain>/api/slack/events`
- 購読イベント: `reaction_added`
- 必要な権限（Bot Token Scopes）:
  - `reactions:read` … `reaction_added` の受信
  - `channels:history` / `groups:history` … 元メッセージ本文の取得（public/privateに応じて）
  - `chat:write` … `postEphemeral` 投稿
- **Botを対象チャンネルに招待**してください（`/invite @Flag Reaction Translator`）。本文取得・ephemeral投稿ともBotがチャンネルメンバーである必要があります。
- `manifest.json` をそのまま Slack App の「App Manifest」に貼り付けて作成できます。

## 注意事項

- **ephemeralの制約**: 翻訳結果は押した本人だけに見え、リロードで消えます。検索・編集・共有・他者への表示はできません（「自分用の読解補助」用途向け）。
- **ベトナム語とDeepLについて**: 当初DeepLを検討しましたが、DeepLの無料枠は次世代モデル非対応で**ベトナム語が使えない**ため、Google Cloud Translation を採用しています。
- **Google課金**: 無料枠（月50万文字）の利用にも、Google Cloud側で請求先アカウントの設定が必要です。
- **APIキー管理**: サーバーレスではHTTPリファラ/IP制限を効かせにくいため、`GOOGLE_TRANSLATE_API_KEY` は環境変数で厳重に管理してください。
