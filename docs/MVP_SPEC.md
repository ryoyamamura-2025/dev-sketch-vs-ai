# MVP Specification

## 1. Product concept

家族内で複数端末から遊ぶ、AIとのリアルタイムお絵描き早押しゲーム。

コアメッセージ：

> **AIより先に当てろ！**

描き手がお題を絵で表現し、ほかの人間プレイヤーとAIが何を描いているかを競って当てる。

## 2. Game objective

- 1ゲームは先勝制。
- ゲーム開始前に 3 / 5 / 7 勝先取を選択する。
- AIも1プレイヤーとして得点する。
- 最初に規定勝数へ到達した人間プレイヤーまたはAIが優勝。

## 3. Round flow

### 3.1 Drawer selection

- 各ラウンドの描き手はホストが自由に1人選ぶ。
- ローテーションや描画回数の公平性はMVPでは管理しない。
- 描き手自身はそのラウンドの回答者にはならない。

### 3.2 Prompt preparation

- 描画端末だけが現在のお題を知る。
- ホストを含む他端末には現在のお題を送らない。
- 描画端末が、現在有効な未使用カテゴリからランダムに1つ選ぶ。
- 描き手はお題を確認し、`準備OK` を押す。
- お題確認中は時間制限なし。

### 3.3 Round start

- `準備OK` 後に描画Canvasを表示。
- 描き手が最初の1画を描いた時点でラウンド開始。
- ホストが最初の描画開始イベントを受理した時点をタイマー開始のAuthorityとする。
- 同時にAIの周期推論を開始する。

### 3.4 Human buzz

- 回答者は分かった瞬間に自分の端末で大きな `わかった！` ボタンを押す。
- 最初にホストが有効な状態で処理したbuzzのみ受理する。
- buzz受理後：
  - 描画停止
  - タイマー停止
  - AI周期推論停止
  - 全端末に回答者を表示
- 回答者は口頭で答える。
- 描き手だけに `正解` / `不正解` ボタンを表示する。

### 3.5 Correct human answer

- 描き手が `正解` を押す。
- buzzした人間プレイヤーに1勝を加算。
- ラウンド終了。

### 3.6 Incorrect human answer

- 描き手が `不正解` を押す。
- ペナルティなし。
- そのプレイヤーは再開後すぐ再度buzzしてよい。
- 停止時の残り時間からラウンド再開。
- 描画とAI推論も再開。

### 3.7 AI win

AIが勝つ条件：

1. 現在ゲームで有効なカテゴリ集合の中でTop1がお題と一致する。
2. そのカテゴリのモデル本来のconfidenceが、ゲーム設定のAI勝利しきい値以上。

条件成立時に描画端末が `ai_correct` をホストへ送る。

ホストがまだ `drawing` phaseである場合のみAI勝利として確定し、AIに1勝を加算する。

### 3.8 Human vs AI near-simultaneous event

- `buzz` と `ai_correct` がほぼ同時でも、ホストが先に有効状態として処理したものを採用する。
- 一度phaseが変わった後に届いた競合イベントは無視する。
- 二重勝利は認めない。

### 3.9 Timeout

- 制限時間初期値は120秒。
- ホストが0秒を確定したらラウンド終了。
- 誰にも得点なし。
- お題を公開して結果画面へ進む。

## 4. Game settings

ホストのみ編集可能。参加者端末には閲覧用として同期する。

### Defaults

- Wins to finish: 3
- Round time: 120 sec
- AI win confidence threshold: 15%
- Prompt preset: `こども向け` 72 categories

### Editable

- Wins to finish: 3 / 5 / 7
- Round time: numeric
- AI win threshold: numeric percentage
- Enabled prompt categories

## 5. Prompt categories

### 5.1 Master set

Quick Draw 345 categoriesをマスター集合として持つ。

モデル内部のカテゴリID/ラベルは英語を正とし、UIで日本語表示名に変換する。

### 5.2 Default child preset

初期プリセットは72カテゴリ。

#### Animals (29)

- cat / ねこ
- dog / いぬ
- rabbit / うさぎ
- bear / くま
- bird / とり
- butterfly / ちょうちょ
- cow / うし
- crab / かに
- crocodile / ワニ
- dolphin / イルカ
- duck / あひる
- elephant / ぞう
- fish / さかな
- frog / かえる
- giraffe / キリン
- horse / うま
- lion / ライオン
- monkey / さる
- octopus / たこ
- owl / ふくろう
- panda / パンダ
- penguin / ペンギン
- pig / ぶた
- shark / サメ
- sheep / ひつじ
- snail / かたつむり
- snake / へび
- whale / くじら
- zebra / しまうま

#### Food (17)

- apple / りんご
- banana / バナナ
- bread / パン
- broccoli / ブロッコリー
- carrot / にんじん
- cookie / クッキー
- donut / ドーナツ
- grapes / ぶどう
- hamburger / ハンバーガー
- ice cream / アイスクリーム
- lollipop / ペロペロキャンディ
- mushroom / きのこ
- pear / なし
- pineapple / パイナップル
- pizza / ピザ
- strawberry / いちご
- watermelon / すいか

#### Objects / vehicles / nature (26)

- airplane / ひこうき
- backpack / リュック
- bicycle / じてんしゃ
- book / ほん
- bus / バス
- car / くるま
- chair / いす
- clock / とけい
- cloud / くも
- crown / おうかん
- door / ドア
- firetruck / しょうぼうしゃ
- flower / はな
- house / いえ
- key / かぎ
- moon / つき
- pencil / えんぴつ
- rainbow / にじ
- scissors / はさみ
- shoe / くつ
- soccer ball / サッカーボール
- star / ほし
- sun / たいよう
- train / でんしゃ
- tree / き
- umbrella / かさ

### 5.3 Category selection UX

設定画面に以下を用意する。

- `こども向け72に戻す`
- `すべて選択`
- `すべて解除`
- 個別ON/OFF

ゲームにならない極端な設定は開始前にバリデーションする。

### 5.4 Reuse rules

- 同一ゲーム中、使用済みお題は原則再出題しない。
- 有効カテゴリをすべて使い切った場合のみ使用済み集合をリセットする。

## 6. AI behavior

### 6.1 Runtime behavior

- AIは描画端末のみで実行。
- 外部AI APIは使用しない。
- 最初の1画以降、およそ1秒ごとに推論する。
- `answering` 中は推論停止。
- 不正解後の再開で推論再開。
- Undo / Clearをしても推論スケジュール自体は維持し、次回周期で最新Canvasを評価する。

### 6.2 Prediction display

全端末に常時以下を表示する。

- AIのひとこと
- Top 3 prediction labels
- 各predictionのconfidence

表示例：

- ねこ 18.4%
- いぬ 11.2%
- くま 6.8%

### 6.3 Confidence display semantics

- 有効カテゴリ集合の中からTop3を選ぶ。
- ただし表示confidenceは有効カテゴリだけで再正規化しない。
- モデルの元の出力確率を表示する。

### 6.4 AI message tiers

Top1 confidenceで以下を切り替える。

- `< 3%`: `うーん、わからない…`
- `3%–<8%`: `もしかして○○？`
- `8%–<15%`: `○○かな？`
- `15%–<30%`: `○○な気がする！`
- `>=30%`: `○○だと思う！`

このメッセージ境界とAI勝利しきい値は独立する。

## 7. Drawing UX

### Canvas

- 正方形
- 白背景
- 黒線
- 線幅固定
- デジタル描画のみ

### Controls

- Draw
- Undo
- Clear all

MVPでは以下を実装しない。

- color palette
- shapes
- fill
- camera/paper import

### Undo semantics

- pointer down から pointer up までを1 strokeとして扱う。
- Undoは直近stroke単位。

## 8. Room and player UX

### Top screen

- `部屋を作る`
- `部屋に入る`

### Create room

- Host name input
- Generate random 6-digit room code
- Enter lobby

### Join room

- 6-digit room code input
- Player name input
- Join

### Identity

- 表示名とは別にランダムplayerIdを持つ。
- 同一room内の同名表示は拒否する。
- アカウントは作らない。

## 9. Screens

### Lobby

All clients:

- room code
- player list
- host indicator
- connection state
- current settings summary

Host only:

- edit settings
- start game

### Drawer selection

Host only:

- choose any connected player as drawer

Others:

- wait state

### Ready

Drawer:

- private prompt
- `準備OK`

Others:

- `○○さんがお題を確認中`

### Drawing

Drawer:

- large Canvas
- Undo
- Clear

Answerers:

- synchronized Canvas
- large `わかった！` button

All:

- remaining time
- scores including AI
- AI message
- AI Top3 + confidence

### Answering

All:

- stopped Canvas state
- `○○さんが回答！`

Drawer only:

- `正解`
- `不正解`

### Result

- prompt reveal
- round winner or timeout
- current scores

Host only:

- next round

### Finished

- game winner
- final scores
- replay
- return to top

## 10. Accessibility / child UX

A six-year-old must be able to participate as an answerer with minimal explanation.

Therefore:

- no typing answers during play
- no speech recognition
- large touch targets
- concise Japanese labels
- `わかった！` is the primary answer interaction
- untimed prompt reading
- timer starts only on first stroke

## 11. Persistence

MVP persists nothing after the game ends.

No:

- account
- saved scores
- history
- statistics
- previous rooms

## 12. MVP exclusions

Do not implement unless a later explicit requirement changes the scope:

- paper/camera input
- public matchmaking
- accounts
- persistent DB game history
- host migration
- robust reconnect/session recovery
- mid-round canvas reconstruction for late joiners
- voice recognition answer validation
- custom AI training
- remote AI API
- incorrect-answer penalties

## 13. First playable acceptance criteria

The PoC succeeds when multiple family devices can:

1. Join the same room.
2. Select a drawer.
3. Keep the prompt private to the drawer.
4. Show drawing strokes on answerer devices in near real time.
5. Run on-device AI inference about once per second.
6. Show Top3 and confidence on all devices.
7. Buzz before the AI.
8. Pause correctly for spoken answer confirmation.
9. Resume after an incorrect answer.
10. Award scores to either a human or AI.
11. Finish a first-to-N game without divergent results.
