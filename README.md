# fukuwarai
kintone 上で動作する「福笑いゲームシステム」の設計書とカスタマイズコードを収録しています。詳細は [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) を参照してください。

## JavaScript/CSS カスタマイズ
- `src/play.js`: 詳細画面でのゲームプレイ・自動採点・画像保存・BGM 再生を実装。
- `src/ranking.js`: 一覧画面カスタムビュー「RankingView」でのリアルタイムランキング表示を実装。
- `src/styles.css`: ゲームエリアとランキングのレイアウト・装飾スタイル。

### 適用方法
1. kintone の App C（福笑いプレイアプリ）でカスタマイズファイルとして上記 JS/CSS を登録します（Konva.js / Howler.js / SweetAlert2 / kintone UI Component を先に読み込み）。
2. 詳細画面イベント `app.record.detail.show` でステータス「プレイ中」の場合に福笑いゲームが起動し、配置完了後は自動採点と画像保存を行います。
3. 一覧画面でビュー名「RankingView」を選択すると、10 秒間隔で自動更新されるランキングカードがヘッダー領域に表示されます。
