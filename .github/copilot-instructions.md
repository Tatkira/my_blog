# Hexo 博客项目指南

本工作区包含 Hexo 博客 (`My_Blog`) 和静态简历 (`web-resume-resume-master`)。
**主要关注点**: `My_Blog` (除非明确询问简历)。

## 架构概览
- **核心框架**: Hexo (Node.js 静态生成器)。
- **目录结构**:
  - `My_Blog/`: 博客根目录。
  - `My_Blog/source/`: 内容源文件 (Markdown 文章, 页面)。
  - `My_Blog/themes/my-landscape/`: **自定义主题** (基于 landscape)。所有 UI/样式修改都在此进行。
  - `web-resume-resume-master/`: 独立简历项目 (HTML/CSS/JS)，不经过 Hexo 构建。

## 关键配置
- **站点配置**: `My_Blog/_config.yml`
  - `index_generator.path: '/blog'` (首页路径为 /blog)。
  - `deploy`: Git 部署到 `gh-pages` 分支。
- **主题配置**: `My_Blog/themes/my-landscape/_config.yml`
  - 菜单: Home (`/`), Archives (`/archives`)。
  - 侧边栏: 左侧 (`left`)。

## 开发工作流
- **运行**: `npm run server` (在 `My_Blog` 目录下)。访问 `http://localhost:4000`。
- **构建**: `npm run build` (生成到 `public/` 目录)。
- **部署**: `npm run deploy` (推送到 GitHub)。
- **清理**: `npm run clean` (解决缓存问题时使用)。

## 编码规范与模式
- **主题修改**:
  - **布局**: 编辑 `themes/my-landscape/layout/` (EJS 模板)。
    - `layout.ejs`: 全局骨架。
    - `portfolio.ejs`: 自定义作品集页面布局。
  - **样式**: 编辑 `themes/my-landscape/source/css/` (Stylus `.styl`)。
    - `style.styl`: 主入口。
  - **禁止**: 不要修改 `node_modules/` 中的文件。

- **内容创作**:
  - 位置: `My_Blog/source/_posts/`。
  - **Front Matter (必须)**:
    ```yaml
    ---
    title: 文章标题
    date: YYYY-MM-DD HH:mm:ss
    tags: [标签1, 标签2]
    categories: 分类名
    ---
    ```
  - **图片**: 存放在 `My_Blog/source/images/`，引用方式 `![](/images/name.jpg)`。

- **简历项目**:
  - 纯静态 HTML/CSS/JS 项目。
  - 修改 `web-resume-resume-master/` 下的文件。
  - 样式文件位于 `css/`，脚本位于 `js/`。
