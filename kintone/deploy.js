#!/usr/bin/env node

/**
 * kintoneアプリの作成・フィールド追加・デプロイスクリプト
 * 
 * 使用方法:
 *   node kintone/deploy.js
 * 
 * 環境変数:
 *   KINTONE_BASE_URL: kintoneのベースURL (例: https://your-domain.cybozu.com)
 *   KINTONE_USERNAME: kintoneのユーザー名
 *   KINTONE_PASSWORD: kintoneのパスワード
 *   KINTONE_API_TOKEN: APIトークン（パスワードの代わりに使用可能）
 */

const fs = require('fs');
const path = require('path');
const { KintoneRestAPIClient } = require('@kintone/rest-api-client');

// 環境変数の取得
const BASE_URL = process.env.KINTONE_BASE_URL;
const USERNAME = process.env.KINTONE_USERNAME;
const PASSWORD = process.env.KINTONE_PASSWORD;
const API_TOKEN = process.env.KINTONE_API_TOKEN;

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

// アプリ定義
const APPS = [
  {
    name: 'チームマスタ',
    code: 'team_master',
    fieldsFile: 'app-a-fields.json',
    description: 'チーム情報を管理するマスタアプリ',
  },
  {
    name: 'ステージ設定マスタ',
    code: 'stage_master',
    fieldsFile: 'app-b-fields.json',
    description: 'ステージ（テーマ）情報を管理するマスタアプリ',
  },
  {
    name: '福笑いプレイアプリ',
    code: 'fukuwarai_play',
    fieldsFile: 'app-c-fields.json',
    description: '福笑いゲームのプレイ記録を管理するアプリ',
  },
];

/**
 * JSONファイルを読み込む
 */
function loadFieldsJson(filePath) {
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
 * アプリを作成する
 */
async function createApp(appName, appCode, description) {
  try {
    console.log(`\n📱 アプリ「${appName}」を作成中...`);
    
    // 既存のアプリを検索
    try {
      const apps = await client.app.getApps({ codes: [appCode] });
      if (apps.apps && apps.apps.length > 0) {
        const existingApp = apps.apps[0];
        console.log(`⚠️  アプリ「${appName}」は既に存在します: アプリID = ${existingApp.appId}`);
        return existingApp.appId;
      }
    } catch (searchError) {
      // 検索エラーは無視して続行
    }

    const result = await client.app.addApp({
      name: appName,
    });
    const appId = result.app;
    console.log(`✅ アプリ作成成功: アプリID = ${appId}`);

    // アプリ設定を更新（新規作成されたアプリは自動的にプレビュー環境）
    try {
      await client.app.updateAppSettings({
        app: appId,
        name: appName,
        description: description,
        icon: {
          type: 'PRESET',
          key: 'APP72',
        },
      });
      console.log(`✅ アプリ設定を更新しました`);
    } catch (error) {
      console.warn(`⚠️  アプリ設定の更新に失敗しました:`, error.message);
    }

    return appId;
  } catch (error) {
    console.error(`❌ アプリ作成エラー:`, error.message);
    if (error.errors) {
      console.error('詳細:', JSON.stringify(error.errors, null, 2));
    }
    throw error;
  }
}

/**
 * フィールドを追加する
 */
async function addFields(appId, fieldsJson) {
  try {
    console.log(`\n📝 フィールドを追加中...`);
    
    // 既存のフィールドを取得（プレビュー環境）
    const currentFields = await client.app.getFormFields({ app: appId, preview: true });
    
    // 新しいフィールドのみを追加（SPACERはレイアウト要素なので除外）
    const fieldsToAdd = {};
    for (const field of fieldsJson.properties) {
      // SPACERはレイアウト要素なので、フィールドプロパティとして追加できない
      if (field.type === 'SPACER') {
        console.log(`  ⏭️  フィールド「${field.label}」(${field.code})はレイアウト要素のためスキップ（後でレイアウト更新で追加）`);
        continue;
      }
      if (!currentFields.properties[field.code]) {
        fieldsToAdd[field.code] = field;
      } else {
        console.log(`  ⏭️  フィールド「${field.label}」(${field.code})は既に存在するためスキップ`);
      }
    }

    if (Object.keys(fieldsToAdd).length === 0) {
      console.log(`✅ 追加するフィールドはありません`);
      return;
    }

    await client.app.addFormFields({
      app: appId,
      properties: fieldsToAdd,
      preview: true,
    });
    
    console.log(`✅ ${Object.keys(fieldsToAdd).length}個のフィールドを追加しました`);
  } catch (error) {
    console.error(`❌ フィールド追加エラー:`, error.message);
    if (error.errors) {
      console.error('詳細:', JSON.stringify(error.errors, null, 2));
    }
    throw error;
  }
}

/**
 * ルックアップフィールドを追加する
 */
async function addLookupFields(appId, appAId, appBId) {
  try {
    console.log(`\n🔗 ルックアップフィールドを追加中...`);
    
    // App Cのフィールドを取得
    let appCFields = {};
    try {
      const fields = await client.app.getFormFields({ app: appId, preview: true });
      appCFields = fields.properties;
    } catch (error) {
      console.warn(`  ⚠️  App Cのフィールド取得に失敗しました:`, error.message);
    }
    
    // 条件として使用する一時的な文字列フィールドを作成（型が一致する必要があるため）
    const tempConditionFieldCode = '_temp_lookup_condition';
    let conditionField = tempConditionFieldCode;
    
    // 一時フィールドが存在しない場合は作成
    if (!appCFields[tempConditionFieldCode]) {
      try {
        await client.app.addFormFields({
          app: appId,
          properties: {
            [tempConditionFieldCode]: {
              code: tempConditionFieldCode,
              type: 'SINGLE_LINE_TEXT',
              label: 'ルックアップ条件用（非表示推奨）',
              required: false,
              noLabel: false,
            },
          },
          preview: true,
        });
        console.log(`  ✅ 条件用の一時フィールドを作成しました`);
      } catch (error) {
        console.warn(`  ⚠️  一時フィールドの作成に失敗しました:`, error.message);
        // 既存の文字列フィールドを探す
        conditionField = Object.keys(appCFields).find(code => 
          appCFields[code].type === 'SINGLE_LINE_TEXT'
        );
        if (!conditionField) {
          throw new Error('条件として使用できる文字列フィールドが見つかりません');
        }
      }
    }
    
    const fieldsToAdd = {};

    // team_lookupフィールドの追加
    if (appAId) {
      // App Aのフィールドを取得してdisplayFieldsを設定
      let displayFields = ['team_name'];
      let relatedField = 'team_name';
      
      try {
        const appAFields = await client.app.getFormFields({ app: appAId });
        if (appAFields.properties.team_name) {
          displayFields = ['team_name'];
          relatedField = 'team_name';
        } else if (Object.keys(appAFields.properties).length > 0) {
          const firstField = Object.keys(appAFields.properties)[0];
          displayFields = [firstField];
          relatedField = firstField;
        }
      } catch (error) {
        console.warn(`  ⚠️  App Aのフィールド取得に失敗しました:`, error.message);
      }

      const teamLookupField = {
        code: 'team_lookup',
        type: 'REFERENCE_TABLE',
        label: 'チーム選択',
        referenceTable: {
          relatedApp: {
            app: appAId,
            code: null,
          },
          condition: {
            field: conditionField,
            relatedField: relatedField,
          },
          displayFields: displayFields,
          filterCond: '',
          sort: '',
          size: '5',
        },
      };
      fieldsToAdd.team_lookup = teamLookupField;
    }

    // theme_lookupフィールドの追加
    if (appBId) {
      // App Bのフィールドを取得してdisplayFieldsを設定
      let displayFields = ['theme_name'];
      let relatedField = 'theme_name';
      
      try {
        const appBFields = await client.app.getFormFields({ app: appBId });
        if (appBFields.properties.theme_name) {
          displayFields = ['theme_name'];
          relatedField = 'theme_name';
        } else if (Object.keys(appBFields.properties).length > 0) {
          const firstField = Object.keys(appBFields.properties)[0];
          displayFields = [firstField];
          relatedField = firstField;
        }
      } catch (error) {
        console.warn(`  ⚠️  App Bのフィールド取得に失敗しました:`, error.message);
      }

      const themeLookupField = {
        code: 'theme_lookup',
        type: 'REFERENCE_TABLE',
        label: 'テーマ選択',
        referenceTable: {
          relatedApp: {
            app: appBId,
            code: null,
          },
          condition: {
            field: conditionField,
            relatedField: relatedField,
          },
          displayFields: displayFields,
          filterCond: '',
          sort: '',
          size: '5',
        },
      };
      fieldsToAdd.theme_lookup = themeLookupField;
    }

    if (Object.keys(fieldsToAdd).length > 0) {
      await client.app.addFormFields({
        app: appId,
        properties: fieldsToAdd,
        preview: true,
      });
      console.log(`✅ ${Object.keys(fieldsToAdd).length}個のルックアップフィールドを追加しました`);
    } else {
      console.log(`⏭️  追加するルックアップフィールドはありません`);
    }
  } catch (error) {
    console.error(`❌ ルックアップフィールドの追加に失敗しました:`, error.message);
    if (error.errors) {
      console.error('詳細:', JSON.stringify(error.errors, null, 2));
    }
    throw error;
  }
}

/**
 * レイアウトにSPACERフィールドを追加する
 */
async function addSpacerToLayout(appId, spacerCode, spacerLabel) {
  try {
    console.log(`\n📐 レイアウトにスペースフィールド「${spacerLabel}」を追加中...`);
    
    // 現在のレイアウトを取得
    const currentLayout = await client.app.getFormLayout({ app: appId, preview: true });
    
    // 既にSPACERが存在するか確認（レイアウト全体を再帰的に検索）
    const findSpacer = (layout) => {
      for (const item of layout) {
        if (item.type === 'SPACER' && item.elementId === spacerCode) {
          return true;
        }
        if (item.type === 'ROW' && item.fields) {
          for (const field of item.fields) {
            if (field.type === 'SPACER' && field.elementId === spacerCode) {
              return true;
            }
          }
        }
        if (item.type === 'GROUP' && item.layout) {
          if (findSpacer(item.layout)) {
            return true;
          }
        }
      }
      return false;
    };
    
    if (findSpacer(currentLayout.layout)) {
      console.log(`  ⏭️  スペースフィールド「${spacerLabel}」は既にレイアウトに存在します`);
      return;
    }
    
    // SPACERを新しいROWとして追加
    const newLayout = [...currentLayout.layout];
    newLayout.push({
      type: 'ROW',
      fields: [
        {
          type: 'SPACER',
          elementId: spacerCode,
          size: {
            width: '500',
            height: '400',
          },
        },
      ],
    });
    
    await client.app.updateFormLayout({
      app: appId,
      layout: newLayout,
      preview: true,
    });
    
    console.log(`✅ スペースフィールド「${spacerLabel}」をレイアウトに追加しました`);
  } catch (error) {
    console.warn(`⚠️  スペースフィールドの追加に失敗しました:`, error.message);
    if (error.errors) {
      console.warn('詳細:', JSON.stringify(error.errors, null, 2));
    }
    console.warn(`  手動でレイアウト編集画面からスペースフィールド「${spacerLabel}」を追加してください`);
    // エラーでも続行（手動で追加可能）
  }
}

/**
 * アプリをデプロイする
 */
async function deployApp(appId) {
  try {
    console.log(`\n🚀 アプリをデプロイ中...`);
    await client.app.deployApp({
      apps: [{ app: appId }],
      revert: false,
    });
    console.log(`✅ デプロイ成功`);
  } catch (error) {
    console.error(`❌ デプロイエラー:`, error.message);
    throw error;
  }
}

/**
 * メイン処理
 */
async function main() {
  console.log('🎯 kintoneアプリのデプロイを開始します...\n');
  console.log(`接続先: ${BASE_URL}`);

  const appIds = {};

  try {
    // 各アプリを作成・設定
    for (const appConfig of APPS) {
      const appId = await createApp(appConfig.name, appConfig.code, appConfig.description);
      appIds[appConfig.code] = appId;

      const fieldsJson = loadFieldsJson(appConfig.fieldsFile);
      await addFields(appId, fieldsJson);

      // ルックアップフィールドの追加（App Cのみ）
      if (appConfig.code === 'fukuwarai_play') {
        await addLookupFields(appId, appIds.team_master, appIds.stage_master);
        
        // SPACERフィールドをレイアウトに追加（App Cのみ）
        const spacerField = fieldsJson.properties.find((f) => f.type === 'SPACER');
        if (spacerField) {
          await addSpacerToLayout(appId, spacerField.code, spacerField.label);
        }
      }

      await deployApp(appId);
    }

    console.log('\n✨ すべてのアプリのデプロイが完了しました！\n');
    console.log('作成されたアプリ:');
    for (const appConfig of APPS) {
      console.log(`  - ${appConfig.name}: アプリID ${appIds[appConfig.code]}`);
    }
    console.log('\n次のステップ:');
    console.log('  1. kintoneの管理画面で各アプリの設定を確認してください');
    console.log('  2. App C（福笑いプレイアプリ）にカスタマイズファイルを登録してください');
    console.log('  3. ビュー「RankingView」をApp Cに作成してください');

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

module.exports = { main, createApp, addFields, deployApp };

