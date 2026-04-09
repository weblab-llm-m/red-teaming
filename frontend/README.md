# red-teaming frontend

手動レッドチーミングと自動集計レポート閲覧のためのフロントエンドです。
React + TypeScript + Vite で画面を作り、Cloudflare Worker が OpenAI 互換 API へのプロキシとして動作します。

## 何ができるか

- 退院サマリを選んで手動で攻撃プロンプトを投げる
- provider / model を切り替えて応答を比較する
- 手動判定結果を LocalStorage に保存し、CSV でエクスポートする
- `frontend/public/reports/` に置かれた JSON レポートを読み込んで可視化する

## 構成

```text
frontend/
├── public/
│   ├── discharge_summary_cleaned.csv
│   └── reports/
├── scripts/
│   └── generate-report-index.ts
├── src/
│   ├── App.tsx
│   ├── ReportViewer.tsx
│   ├── api.ts
│   ├── types.ts
│   └── worker.ts
├── package.json
└── wrangler.toml
```

## 実装メモ

### `src/App.tsx`

- `public/discharge_summary_cleaned.csv` を読み込んでターゲット患者一覧を作る
- `types.ts` で定義した attack template と role 設定を UI に出す
- 実行結果は `redteam_results` というキーで LocalStorage に保持する

### `src/api.ts`

- role ごとの可視範囲に合わせてシステムプロンプトへ患者情報を埋め込む
- `/api/chat` に `provider`, `model`, `messages` を送る

### `src/worker.ts`

- `/api/chat` で provider ごとの OpenAI 互換 endpoint に転送する
- `wrangler.toml` の KV namespace を使って IP 単位のレート制限を行う
- 対応 provider は `sakura`

### `src/ReportViewer.tsx`

- `public/reports/index.json` を読んでレポート一覧を作る
- `redteam_report_*.json` を読み込み、AISI 3 観点・attack type・漏洩ケースを表示する

### `scripts/generate-report-index.ts`

- `public/reports/` の JSON レポート一覧から `index.json` を再生成する
- `npm run build` の前に `prebuild` で自動実行される

## セットアップ

```bash
npm install
```

## 開発

```bash
npm run dev
```

Vite の開発サーバーが起動します。
ローカルでは UI の静的部分を確認できますが、Cloudflare Worker を使う API プロキシを動かすには `wrangler` 側の設定も必要です。

## ビルド

```bash
npm run build
```

このとき `generate-report-index.ts` が実行され、`public/reports/index.json` が更新されます。

## レポートの更新

自動集計レポートを UI に反映する流れは次の通りです。

1. `uv run python ../src/analyze_results.py` を実行する
2. JSON レポートが `../results/reports/` に生成される
3. 同じスクリプトが `public/reports/` へコピーし、`index.json` を更新する
4. UI を開くと最新レポートが選択肢に出る

`index.json` だけを再生成する場合は以下を実行してください。

```bash
npm run generate-report-index
```

## デプロイ

本番環境は GitHub Actions で自動デプロイします。
手動デプロイは行わないでください。

公開先: `https://<your-worker-name>.workers.dev`

`wrangler.toml` では次を前提としています。

- `main = "src/worker.ts"`
- 静的アセットは `dist/`
- `RATE_LIMIT` という KV namespace を使用

Worker の secret として、使用する provider の API key を設定してください。

- `SAKURA_API_KEY`

## レート制限

`src/worker.ts` の設定は次の通りです。

| 期間 | 上限 |
| --- | --- |
| 1 分 | 5 回 |
| 1 時間 | 60 回 |
| 1 日 | 200 回 |

## 注意点

- UI の provider 一覧は `../../providers.json` を読みますが、Worker 側で実際にプロキシしているのは `src/worker.ts` の `PROVIDERS` に定義された provider のみです
- `providers.json` に provider を追加した場合は、`src/worker.ts` 側の `PROVIDERS` も合わせて更新してください
- 手動判定結果はブラウザ LocalStorage に保存されるため、共有するには CSV エクスポートが必要です
- `public/discharge_summary_cleaned.csv` は配信用の静的ファイルです。元データを更新した場合は同期してください
