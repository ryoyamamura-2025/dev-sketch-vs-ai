# dev-sketch-vs-ai

家族内で遊ぶ、AIとのリアルタイムお絵描き早押しゲームです。

## コンセプト

**AIより先に当てろ！**

1人が絵を描き、ほかの家族とAIが何を描いているかを競って当てます。人間は分かったら自分の端末で「わかった！」を押して口頭回答し、描き手が正誤判定します。AIは描画端末のブラウザ内で約1秒ごとに推論します。

## MVP技術構成

- React + TypeScript + Vite
- HTML Canvas + Pointer Events
- Supabase Realtime (Broadcast / Presence)
- Quick Draw 345-class TFLite classifier
- LiteRT.jsによるブラウザ内推論
- GitHub Pages
- 独自バックエンドなし
- 永続DBなし

## 仕様

実装時は以下を参照してください。

- `AGENTS.md` — 実装エージェント向けの最上位ガイド
- `docs/MVP_SPEC.md` — ゲームルール・画面・UXの確定仕様
- `docs/ARCHITECTURE.md` — ホストAuthority、Realtime、AI、描画同期の設計
- `docs/IMPLEMENTATION_PLAN.md` — 実装順序とPoC受け入れ条件

## MVPの前提

- 家族限定
- アカウントなし
- 6桁ルームコードで参加
- ホスト端末はゲーム終了まで固定
- 現在のお題は描画端末だけが保持
- デジタル描画のみ
- ゲーム終了後の履歴保存なし
