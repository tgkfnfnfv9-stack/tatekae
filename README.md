# 立替精算書（株式会社小林機械）

現場・社内用の「仮払い金精算書」作成ツール。スマホ（iPhone）で入力し、
領収書を撮影・読込して、A4横1枚のPDFで保存・共有できます。単一HTMLファイルで動作します。

- 本体: `index.html`（ブランド配色：オレンジ／黒／白）
- ホスティング: GitHub Pages でそのまま公開できます

## GitHub Pages で公開する手順
1. GitHubで新しいリポジトリを作成（例: `tatekae`、Public）
2. `index.html` をアップロード（ドラッグ＆ドロップ →「Commit changes」）
3. リポジトリの **Settings → Pages** を開く
4. **Build and deployment** の Source を「Deploy from a branch」にする
5. Branch を `main` / フォルダ `/ (root)` にして **Save**
6. 数十秒後、`https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます

## メモ
- 会社サイト: https://www.kkmt.co.jp
- PDF生成に jsPDF / html2canvas / pdf.js（CDN）を使用（オンライン必要）
