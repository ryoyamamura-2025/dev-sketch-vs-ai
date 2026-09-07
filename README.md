# dev-sketch-vs-ai

家族内で遊ぶ、**AIより先に当てろ！** リアルタイムお絵描き早押しゲームです。

1人が絵を描き、ほかの家族と端末内AIが何を描いているかを競います。人間は大きな `わかった！` ボタンを押して口頭で回答し、描き手が `正解` / `不正解` を判定します。

## 実装済みMVP

- React + TypeScript + Vite の静的Webアプリ
- 6桁ルームコードで作成 / 参加、アカウントなし
- Supabase Realtime Broadcast / Presence による複数端末同期
- 固定Host Authorityによるphase・タイマー・早押し・スコア・勝敗の一元確定
- 描画端末だけが保持する非公開お題
- Pointer Events / 正規化座標 / 約50msチャンクのリアルタイム描画
- stroke単位Undo / Clear
- 先取 3 / 5 / 7、ラウンド時間、AI勝利しきい値、お題カテゴリの設定
- Quick Draw 345カテゴリ、日本語表示、こども向け72カテゴリプリセット
- LiteRT.js + Quick Draw TFLiteモデルによる描画端末内推論
- 有効カテゴリ内Top 3 + 元confidence表示（再正規化なし）
- AIメッセージ5段階
- buzzで描画 / タイマー / AIを停止、不正解なら残り時間から再開
- AI / 人間のほぼ同時イベントをHost受信順で1件だけ確定
- タイムアウト、描き手切断、ホスト切断、途中参加のMVP挙動
- Vitestによる状態機械・race・timer・AI・category・strokeの単体テスト
- ESLint / TypeScript typecheck / GitHub Actions CI
- GitHub Pagesデプロイworkflow

## ローカル起動

Node.js 22を推奨します。

```bash
npm install
cp .env.example .env.local
# .env.local にSupabaseの公開設定を記入
npm run dev
```

チェック一式:

```bash
npm run check
```

## Supabase設定

独自バックエンドやDBテーブルは不要です。Supabaseプロジェクトを1つ用意し、ブラウザ公開可能な値だけを設定します。

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_BROWSER_PUBLIC_KEY
```

`service_role` やsecret keyは絶対にブラウザ / リポジトリへ入れないでください。

Realtimeのroom channelは `room:<6桁コード>`、ゲームイベントはBroadcast、接続情報はPresenceを使用します。MVPの6桁コードは強い認証ではなく、家族内利用向けの軽量なアクセス手段です。

## GitHub Pages

Viteのbaseは `/dev-sketch-vs-ai/` に設定済みです。Repository Variablesに以下を登録すると、`main`へのpushでPages workflowがビルド・テスト・デプロイします。

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_QUICKDRAW_MODEL_URL`（任意。未設定時は下記既定モデル）

## AIモデル

既定では `zarqankhn/quickdraw-345-tflite` のTFLiteモデルを読み込みます。実装時点で確認したモデル契約は以下です。

- input: `float32 [1, 28, 28, 1]`
- pixel range: `0..1`（白背景=1、黒線=0）
- output: `float32 [1, 345]` softmax
- class order: モデル配布物の345 labelsに合わせた順序
- license: Apache-2.0

モデル入出力はロード時にも検証し、想定と異なるartifactへ差し替えた場合は推論を開始しません。

## Authority / privacy

Hostだけが以下を確定します。

- phase
- accepted buzz
- timer / timeout
- scores
- round winner / game winner
- drawer / settings / used prompt IDs

描画端末だけが現在のお題、stroke history、AI推論を保持します。`HostGameState` / `state_snapshot` に現在のお題は含めず、ラウンド終了後に描画端末から `prompt_reveal` します。

## MVPで意図的に未実装

- 公開matchmaking
- account / authentication
- DBへのscore/history保存
- camera / paper input
- voice recognition
- host migration
- active round途中参加者への過去canvas再構築
- full reconnect recovery
- custom backend / Edge Functions

## 仕様書

実装判断の優先順位は `AGENTS.md` に従います。

- `docs/MVP_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/IMPLEMENTATION_PLAN.md`
