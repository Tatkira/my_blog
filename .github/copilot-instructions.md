# Hexo 博客项目指南

本工作区包含一个 Hexo 博客 (`My_Blog`) 和一个静态简历 (`web-resume-resume-master`)。
除非用户特别询问简历，否则请主要关注 `My_Blog`。

## My_Blog 架构
- **核心**: Hexo 静态网站生成器。
- **配置**:
  - 站点配置: `_config.yml` (标题 "Hello DAoner!", 作者 "DAONE", 语言 `zh-CN`, URL, 部署到 GitHub Pages gh-pages 分支)。
  - 主题配置: `themes/my-landscape/_config.yml` (菜单包括 Home, Archives, Portfolio; 侧边栏左侧; 小部件: category, tag, tagcloud, archive, recent_posts)。
- **主题**: 本地自定义主题 `my-landscape` (基于 hexo-theme-landscape)。
  - 布局: `themes/my-landscape/layout/` (EJS 模板，如 `portfolio.ejs` 为自定义页面，无完整 HTML 包装)。
  - 样式: `themes/my-landscape/source/css/` (Stylus `.styl` 文件)。
  - 脚本: `themes/my-landscape/source/js/`。
- **内容**: `source/_posts/` (Markdown 文件，带 YAML Front Matter)。
- **首页**: 配置为 `/home`，使用 `index_generator.path: '/home'`。

## 开发工作流
- **启动服务器**: `npm run server` 或 `hexo server` (实时预览 `http://localhost:4000`)。
- **构建**: `npm run build` 或 `hexo generate` (生成静态文件到 `public/`)。
- **清理**: `npm run clean` 或 `hexo clean` (删除 `public/` 和 `db.json`)。
- **部署**: `npm run deploy` 或 `hexo deploy` (推送到 GitHub gh-pages)。
- **新建文章**: `hexo new "文章标题"` (使用 `scaffolds/post.md`，生成到 `source/_posts/`)。

## 关键约定
- **禁止编辑**: `public/` (生成产物), `db.json` (缓存), `node_modules/`。
- **主题定制**: 始终编辑 `themes/my-landscape/`，切勿修改 `node_modules/hexo-theme-landscape`。
- **静态资源**: 图片放入 `source/images/`，在 Markdown 中引用为 `![](/images/filename.jpg)`。
- **Front Matter**: 文章必须包含 `title`, `date`, `tags` (数组，如 `[前端, Hexo]`), `categories` (如 `技术日记`)。示例见 `source/_posts/初学前端.md`。
- **Portfolio 页面**: 自定义页面布局，无标准 HTML 结构，直接渲染内容。编辑 `themes/my-landscape/layout/portfolio.ejs`。

## 集成
- **简历**: `web-resume-resume-master` 是一个独立的静态网站，使用 HTML/CSS/JS，无构建过程。不会随 Hexo 自动构建。
