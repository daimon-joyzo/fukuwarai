# fukuwarai
kintone 上で動作する「福笑いゲームシステム」の設計書とカスタマイズコードを収録しています。詳細は [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) を参照してください。

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. kintoneアプリの作成・デプロイ

環境変数を設定してデプロイスクリプトを実行します：

```bash
export KINTONE_BASE_URL="https://your-domain.cybozu.com"
export KINTONE_API_TOKEN="your-api-token"
# または
export KINTONE_USERNAME="your-username"
export KINTONE_PASSWORD="your-password"

npm run deploy
```

このスクリプトは以下の3つのkintoneアプリを自動作成します：
- **App A: チームマスタ** - チーム情報を管理
- **App B: ステージ設定マスタ** - ステージ（テーマ）情報を管理
- **App C: 福笑いプレイアプリ** - ゲームプレイ記録を管理

各アプリのフィールド定義は `kintone/` ディレクトリ内の `app-*-fields.json` に定義されています。

### 3. サンプルデータのインポート

デプロイ完了後、サンプルデータをインポートできます：

```bash
npm run import-sample
```

このスクリプトは以下のサンプルデータを各アプリに追加します：
- **App A（チームマスタ）**: 4チームのサンプルデータ
- **App B（ステージ設定マスタ）**: 3つのテーマ（おかめ、ひょっとこ、社長）のサンプルデータ
- **App C（福笑いプレイアプリ）**: 4件のプレイレコード（ルックアップ情報も自動設定）

> **注意**: 既にレコードが存在する場合はスキップされます。App Bには画像と音源は含まれていないため、手動で追加してください。

### 4. カスタマイズファイルの適用

1. kintone の App C（福笑いプレイアプリ）の「設定」→「アプリの設定」→「JavaScript / CSSでカスタマイズ」で、以下の外部ライブラリを先に読み込みます：

   **外部ライブラリ（JavaScript / CSSカスタマイズの「JSファイル」に追加）:**
   - Konva.js: `https://unpkg.com/konva@9/konva.min.js`
   - Howler.js: `https://unpkg.com/howler@2.2.3/dist/howler.min.js`
   - SweetAlert2: `https://cdn.jsdelivr.net/npm/sweetalert2@11`
   - kintone UI Component: `https://unpkg.com/@kintone/kintone-ui-component@latest/dist/kintone-ui-component.min.js`
   
   **カスタマイズファイル（同じく「JSファイル」に追加）:**
   - `src/play.js`
   - `src/ranking.js`
   
   **CSSファイル:**
   - `src/styles.css`
   
   > **注意**: 外部ライブラリはカスタマイズファイルより**先に**読み込む必要があります。読み込み順序を確認してください。

2. 詳細画面イベント `app.record.detail.show` でステータス「プレイ中」の場合に福笑いゲームが起動し、配置完了後は自動採点と画像保存を行います。

3. 一覧画面でビュー名「RankingView」を選択すると、10 秒間隔で自動更新されるランキングカードがヘッダー領域に表示されます。

## JavaScript/CSS カスタマイズ
- `src/play.js`: 詳細画面でのゲームプレイ・自動採点・画像保存・BGM 再生を実装。
- `src/ranking.js`: 一覧画面カスタムビュー「RankingView」でのリアルタイムランキング表示を実装。
- `src/styles.css`: ゲームエリアとランキングのレイアウト・装飾スタイル。
