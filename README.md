# 立替精算書（株式会社小林機械）

現場・社内用の「仮払い金精算書」作成ツール。スマホ（iPhone）で入力し、
領収書を撮影・読込して、A4横の精算書と添付書類をPDFで保存・共有できます。
明細の件数・種類や添付書類に応じて複数ページになります。単一HTMLファイルで動作します。

- 本体: `index.html`（ブランド配色：オレンジ／黒／白）
- ホスティング: GitHub Pages でそのまま公開できます

## GitHub Pages で公開する手順
1. GitHubで新しいリポジトリを作成（例: `tatekae`、Public）
2. `index.html` をアップロード（ドラッグ＆ドロップ →「Commit changes」）
3. リポジトリの **Settings → Pages** を開く
4. **Build and deployment** の Source を「Deploy from a branch」にする
5. Branch を `main` / フォルダ `/ (root)` にして **Save**
6. 数十秒後、`https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます

## AI取込（試作）

Muse等のAIが作成したJSONを貼り付けるだけで入力欄へ反映できます。

- ツール下部の「AI取込」ボタン、または `?ai=1` 付きURLで取込ダイアログが開きます
- JSONの形式は [AI_SCHEMA.md](AI_SCHEMA.md) を参照してください（「保存（データ）」のJSONと同一形式）
- 金額（ガソリン代・手当など）はツール側で自動計算されます。AIは元データだけを入れます
- 取込で現在の入力・添付は貼り付けた内容に置き換わります。領収書は取り込んだ後に追加してください

## メモ
- 会社サイト: https://www.kkmt.co.jp
- PDF生成に jsPDF / html2canvas / pdf.js、HEIC・HEIF変換に heic-to（いずれもCDN）を使用（オンライン必要）
