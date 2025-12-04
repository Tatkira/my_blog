# Hexo 博客项目指南

本工作区包含一个 Hexo 博客 (`My_Blog`) 和一个静态简历 (`web-resume-resume-master`)。
除非用户特别询问简历，否则请主要关注 `My_Blog`。

## My_Blog 架构
- **核心**: Hexo 静态网站生成器。
- **配置**:
  - 站点配置: `_config.yml` (标题, 作者, 语言 `zh-CN`, URL)。
  - 主题配置: `themes/my-landscape/_config.yml` (菜单, 侧边栏, 小部件)。
- **主题**: 本地自定义主题 `my-landscape` (覆盖 `node_modules/hexo-theme-landscape`)。
  - 布局: `themes/my-landscape/layout/` (EJS 模板)。
  - 样式: `themes/my-landscape/source/css/` (Stylus `.styl`)。
  - 脚本: `themes/my-landscape/source/js/`.
- **内容**: `source/_posts/` (带有 YAML Front Matter 的 Markdown 文件)。

## 开发工作流
- **启动服务器**: `npm run server` (实时预览 `http://localhost:4000`)。
- **构建**: `npm run build` (生成静态文件到 `public/`)。
- **清理**: `npm run clean` (删除 `public/` 和 `db.json`)。
- **新建文章**: `hexo new "文章标题"` (使用 `scaffolds/post.md`)。

## 关键约定
- **禁止编辑**: `public/` (生成产物), `db.json` (缓存), `node_modules/`。
- **主题定制**: 始终编辑 `themes/my-landscape/`，切勿修改 `node_modules/hexo-theme-landscape`。
- **静态资源**: 将图片放入 `source/images/`。在 Markdown 中引用为 `![](/images/filename.jpg)`。
- **Front Matter**: 确保 `.md` 文件中包含 `title`, `date`, `tags`, `categories`。

## 集成
- **简历**: `web-resume-resume-master` 是一个独立的静态网站。它不会随 Hexo 自动构建。
