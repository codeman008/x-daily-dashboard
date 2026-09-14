# AI Signal Atlas

一个面向 X（原 Twitter）公开内容的 AI 情报看板。它将精选账号、最新动态、分类关系和影响力数据整理到一个简洁的本地 Web 界面中，帮助你快速发现值得关注的研究、产品、创业和行业趋势。<img width="1344" height="532" alt="image" src="https://github.com/user-attachments/assets/4eab1917-cd20-40d5-acde-ac80b9dbcb44" />


> **Signal Atlas · Tracking Intelligence in Motion**

## 特性

- **知识图谱**：以交互式 Canvas 展示账号之间的分类关系。
- **分类看板**：按研究、产品、AIGC、加密、财经等领域浏览账号。
- **时间线与今日**：查看账号最新公开动态，并按关键词和分类筛选。
- **影响力排行**：按公开粉丝数据排序，支持缓存和按日更新。
- **收藏**：将感兴趣的动态保存在浏览器本地。
- **中英文界面**：支持中文和英文切换。
- **响应式设计**：适配桌面、平板和移动设备。
- **低额度模式**：页面读取本地缓存；只有主动点击刷新时才请求数据。
- **账号管理**：通过界面或 `accounts.json` 管理分类和账号。

<img width="1308" height="623" alt="image" src="https://github.com/user-attachments/assets/0b2f3bd9-eaf4-4da8-b053-b408709d69b8" />


## 技术栈

项目使用原生技术构建，无前端构建步骤：

- Python 3.8+ 标准库 HTTP 服务
- HTML、CSS、原生 JavaScript
- Canvas 2D 知识图谱渲染
- `twitterapi.io` 作为可选的 X 数据接口
- JSON 文件保存账号配置和运行时缓存

## 快速开始

### 环境要求

- Python 3.8 或更高版本
- 一个可用的 [twitterapi.io](https://twitterapi.io/) API Key（仅在刷新动态或资料时需要）

### 安装与启动

```bash
git clone https://github.com/your-name/x-daily-dashboard.git
cd x-daily-dashboard
cp .env.example .env
```

编辑 `.env`，填入自己的 API Key：

```dotenv
TWITTERAPI_KEY=your_api_key_here
```

启动服务：

```bash
python3 server.py
# 或
./start.sh
```

浏览器访问 <http://localhost:8787>。

如果只想浏览静态界面，也可以使用任意静态文件服务器托管 `public/` 目录；动态刷新和账号保存功能需要运行 Python 服务。

## 配置

所有配置通过环境变量提供，示例文件中不包含任何真实凭据：

| 变量 | 默认值 | 说明 |
| --- | ---: | --- |
| `TWITTERAPI_KEY` | 无 | 数据接口密钥，不要提交到 GitHub |
| `PORT` | `8787` | 本地服务端口 |
| `CACHE_TTL` | `900` | 动态缓存时间（秒） |
| `PROFILE_TTL` | `86400` | 账号资料缓存时间（秒） |
| `MAX_PER_USER` | `3` | 每个账号保留的动态数量 |
| `CONCURRENCY` | `8` | 并发请求数 |
| `REQUEST_INTERVAL` | `0.15` | 请求间隔（秒） |

`.env`、`profiles_cache.json` 和临时缓存已加入 `.gitignore`，不会被正常提交。发布前请检查 Git 历史，确保没有泄露过密钥。

## 数据与隐私

- `accounts.json` 是项目使用的公开账号清单，不应放入个人账号、私有账号或访问令牌。
- `profiles_cache.json` 是运行时生成的本地缓存，可能包含头像、简介和粉丝数，默认不提交。
- 项目只处理公开 X 资料和公开动态，不绕过账号权限限制。
- 请遵守 X、数据接口服务商及相关地区的法律和服务条款。
- 不要把 `.env`、API Key、Cookie、个人导出数据或私有缓存上传到公开仓库。

## 账号配置

账号清单保存在 `accounts.json`，格式如下：

```json
{
  "categories": [
    {
      "id": "research",
      "name": "AI Research",
      "color": "#6366f1",
      "accounts": [
        {
          "handle": "karpathy",
          "name": "Andrej Karpathy",
          "desc": "AI researcher and educator"
        }
      ]
    }
  ]
}
```

也可以点击页面中的“管理账号”进行编辑。保存时服务端会校验账号格式、分类 ID 和重复项。

`build_accounts.py` 用于从脚本中的公开清单重新生成账号配置，适合批量维护：

```bash
python3 build_accounts.py
```

运行前请确认脚本中没有加入个人账号、内部账号或需要保密的资料。

## API 接口

服务启动后提供以下接口：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/accounts` | 获取账号和分类配置 |
| `POST` | `/api/accounts` | 校验并保存账号配置 |
| `GET` | `/api/feed` | 获取动态缓存；`?force=1` 手动刷新 |
| `GET` | `/api/profiles` | 获取资料缓存；`?force=1` 请求按日更新 |

动态和资料请求在后台执行，接口会返回 `refreshing`、`progress` 和 `error` 状态，前端据此展示加载进度。

## 项目结构

```text
x-daily-dashboard/
├── server.py              # Python 本地服务、API、抓取和缓存
├── accounts.json          # 公开账号与分类配置
├── build_accounts.py      # 批量生成账号配置
├── public/
│   ├── index.html         # 页面结构和入口
│   ├── app.js             # 视图、交互、数据渲染和国际化
│   ├── styles.css         # 视觉系统、响应式样式和动效
│   └── favicon.svg        # 项目图标
├── .env.example           # 配置模板，不含真实密钥
├── start.sh               # 启动脚本
└── .gitignore              # 私密配置和运行时文件排除规则
```


## 贡献

欢迎提交账号清单、分类、可访问性、性能和界面改进。请保持变更聚焦，并在提交前运行：

```bash
python3 -m py_compile server.py
node --check public/app.js
```

新增账号时，请优先选择公开、长期活跃且对 AI 研究、产品或行业观察有持续价值的账号，并核实账号名称和链接。

## 许可

本项目采用 MIT License。数据接口和 X 内容仍受其各自服务条款约束。<img width="1440" height="778" alt="image" src="https://github.com/user-attachments/assets/1be77723-5c99-421a-a2f1-99f848a2ddb0" />

