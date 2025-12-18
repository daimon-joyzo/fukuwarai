#!/usr/bin/env node

/**
 * kintoneアプリにサンプルデータをインポートするスクリプト
 * 
 * 使用方法:
 *   node kintone/import-sample-data.js
 * 
 * 環境変数:
 *   KINTONE_BASE_URL: kintoneのベースURL (例: https://your-domain.cybozu.com)
 *   KINTONE_USERNAME: kintoneのユーザー名
 *   KINTONE_PASSWORD: kintoneのパスワード
 *   KINTONE_API_TOKEN: APIトークン（パスワードの代わりに使用可能）
 *   APP_A_ID: チームマスタのアプリID（省略時は自動検索）
 *   APP_B_ID: ステージ設定マスタのアプリID（省略時は自動検索）
 *   APP_C_ID: 福笑いプレイアプリのアプリID（省略時は自動検索）
 */

const fs = require('fs');
const path = require('path');
const { KintoneRestAPIClient } = require('@kintone/rest-api-client');

// 環境変数の取得
const BASE_URL = process.env.KINTONE_BASE_URL;
const USERNAME = process.env.KINTONE_USERNAME;
const PASSWORD = process.env.KINTONE_PASSWORD;
const API_TOKEN = process.env.KINTONE_API_TOKEN;
const APP_A_ID = 57;
const APP_B_ID = 58;
const APP_C_ID = 59;

if (!BASE_URL) {
  console.error('エラー: KINTONE_BASE_URL環境変数が設定されていません');
  process.exit(1);
}

if (!API_TOKEN && (!USERNAME || !PASSWORD)) {
  console.error('エラー: KINTONE_API_TOKEN または KINTONE_USERNAME/KINTONE_PASSWORD 環境変数が設定されていません');
  process.exit(1);
}

// kintoneクライアントの初期化
const client = new KintoneRestAPIClient({
  baseUrl: BASE_URL,
  auth: API_TOKEN
    ? { apiToken: API_TOKEN }
    : { username: USERNAME, password: PASSWORD },
});

/**
 * JSONファイルを読み込む
 */
function loadSampleData(filePath) {
  try {
    const fullPath = path.join(__dirname, filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`エラー: ${filePath} の読み込みに失敗しました:`, error.message);
    throw error;
  }
}

/**
 * アプリIDを検索する
 */
async function findAppId(appCode, appName) {
  try {
    const apps = await client.app.getApps({ codes: [appCode] });
    if (apps.apps && apps.apps.length > 0) {
      return apps.apps[0].appId;
    }
    // コードで見つからない場合は名前で検索
    const appsByName = await client.app.getApps({ name: appName });
    if (appsByName.apps && appsByName.apps.length > 0) {
      return appsByName.apps[0].appId;
    }
    return null;
  } catch (error) {
    console.warn(`⚠️  アプリ「${appName}」の検索に失敗しました:`, error.message);
    return null;
  }
}

/**
 * レコードを追加する
 */
async function addRecords(appId, records) {
  try {
    if (!records || records.length === 0) {
      console.log('  ⏭️  追加するレコードがありません');
      return;
    }

    // 100件ずつに分割して追加（kintoneの制限）
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      await client.record.addRecords({
        app: appId,
        records: batch,
      });
      console.log(`  ✅ ${batch.length}件のレコードを追加しました（${i + 1}-${Math.min(i + batchSize, records.length)}件目）`);
    }
  } catch (error) {
    console.error(`❌ レコード追加エラー:`, error.message);
    if (error.errors) {
      console.error('詳細:', JSON.stringify(error.errors, null, 2));
    }
    throw error;
  }
}

/**
 * 既存のレコードを確認する
 */
async function checkExistingRecords(appId) {
  try {
    const result = await client.record.getRecords({
      app: appId,
      query: 'limit 1',
    });
    return result.records.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * App Cのレコードにルックアップフィールドを設定する
 */
async function updateAppCRecordsWithLookup(appCId, appAId, appBId) {
  try {
    console.log(`\n🔗 App Cのレコードにルックアップ情報を設定中...`);
    
    // App AとApp Bのレコードを取得
    const appARecords = await client.record.getRecords({
      app: appAId,
      query: 'order by $id asc',
    });
    const appBRecords = await client.record.getRecords({
      app: appBId,
      query: 'order by $id asc',
    });

    if (appARecords.records.length === 0 || appBRecords.records.length === 0) {
      console.log('  ⚠️  App AまたはApp Bにレコードが存在しないため、ルックアップ設定をスキップします');
      return;
    }

    // App Cのレコードを取得
    const appCRecords = await client.record.getRecords({
      app: appCId,
      query: 'order by $id asc',
    });

    if (appCRecords.records.length === 0) {
      console.log('  ⚠️  App Cにレコードが存在しないため、ルックアップ設定をスキップします');
      return;
    }

    // 各レコードにルックアップ情報を設定
    const updates = [];
    for (let i = 0; i < appCRecords.records.length; i++) {
      const record = appCRecords.records[i];
      const teamIndex = i % appARecords.records.length;
      const themeIndex = i % appBRecords.records.length;

      const teamRecord = appARecords.records[teamIndex];
      const themeRecord = appBRecords.records[themeIndex];

      // ルックアップテーブルフィールドの値は、参照先レコードのIDを配列で指定
      updates.push({
        id: record.$id.value,
        record: {
          team_lookup: {
            value: [
              {
                value: {
                  id: teamRecord.$id.value,
                },
              },
            ],
          },
          theme_lookup: {
            value: [
              {
                value: {
                  id: themeRecord.$id.value,
                },
              },
            ],
          },
        },
      });
    }

    // 100件ずつに分割して更新
    const batchSize = 100;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      await client.record.updateRecords({
        app: appCId,
        records: batch,
      });
      console.log(`  ✅ ${batch.length}件のレコードを更新しました（${i + 1}-${Math.min(i + batchSize, updates.length)}件目）`);
    }
  } catch (error) {
    console.warn(`⚠️  ルックアップ情報の設定に失敗しました:`, error.message);
    if (error.errors) {
      console.warn('詳細:', JSON.stringify(error.errors, null, 2));
    }
  }
}

/**
 * メイン処理
 */
async function main() {
  console.log('📥 kintoneアプリにサンプルデータをインポートします...\n');
  console.log(`接続先: ${BASE_URL}\n`);

  try {
    // アプリIDを取得
    let appAId = APP_A_ID;
    let appBId = APP_B_ID;
    let appCId = APP_C_ID;

    if (!appAId) {
      console.log('🔍 App A（チームマスタ）を検索中...');
      appAId = await findAppId('team_master', 'チームマスタ');
      if (!appAId) {
        console.error('❌ App A（チームマスタ）が見つかりません');
        process.exit(1);
      }
      console.log(`✅ App A ID: ${appAId}`);
    }

    if (!appBId) {
      console.log('🔍 App B（ステージ設定マスタ）を検索中...');
      appBId = await findAppId('stage_master', 'ステージ設定マスタ');
      if (!appBId) {
        console.error('❌ App B（ステージ設定マスタ）が見つかりません');
        process.exit(1);
      }
      console.log(`✅ App B ID: ${appBId}`);
    }

    if (!appCId) {
      console.log('🔍 App C（福笑いプレイアプリ）を検索中...');
      appCId = await findAppId('fukuwarai_play', '福笑いプレイアプリ');
      if (!appCId) {
        console.error('❌ App C（福笑いプレイアプリ）が見つかりません');
        process.exit(1);
      }
      console.log(`✅ App C ID: ${appCId}`);
    }

    // App Aのサンプルデータをインポート
    console.log('\n📝 App A（チームマスタ）にサンプルデータを追加中...');
    const hasAppARecords = await checkExistingRecords(appAId);
    if (hasAppARecords) {
      console.log('  ⚠️  既にレコードが存在するためスキップします');
    } else {
      const appAData = loadSampleData('sample-data/app-a-sample.json');
      await addRecords(appAId, appAData);
    }

    // App Bのサンプルデータをインポート
    console.log('\n📝 App B（ステージ設定マスタ）にサンプルデータを追加中...');
    const hasAppBRecords = await checkExistingRecords(appBId);
    if (hasAppBRecords) {
      console.log('  ⚠️  既にレコードが存在するためスキップします');
    } else {
      const appBData = loadSampleData('sample-data/app-b-sample.json');
      await addRecords(appBId, appBData);
    }

    // App Cのサンプルデータをインポート
    console.log('\n📝 App C（福笑いプレイアプリ）にサンプルデータを追加中...');
    const hasAppCRecords = await checkExistingRecords(appCId);
    if (hasAppCRecords) {
      console.log('  ⚠️  既にレコードが存在するためスキップします');
    } else {
      const appCData = loadSampleData('sample-data/app-c-sample.json');
      await addRecords(appCId, appCData);
    }

    // App Cのレコードにルックアップ情報を設定
    await updateAppCRecordsWithLookup(appCId, appAId, appBId);

    console.log('\n✨ サンプルデータのインポートが完了しました！\n');
    console.log('次のステップ:');
    console.log('  1. App B（ステージ設定マスタ）に画像と音源を手動で追加してください');
    console.log('  2. App C（福笑いプレイアプリ）のレコードで「ステータス」を「プレイ中」に変更してゲームを開始できます');

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error.message);
    if (error.errors) {
      console.error('詳細:', JSON.stringify(error.errors, null, 2));
    }
    process.exit(1);
  }
}

// スクリプト実行
if (require.main === module) {
  main();
}

module.exports = { main, addRecords, findAppId };

