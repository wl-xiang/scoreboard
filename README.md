# 比赛计分管理系统

基于 B/S 架构的比赛计分管理系统，支持比赛创建、选手管理、多评委双模式计分、实时排行榜与 Excel 结果导出，提供 Docker 一键部署。

## 技术栈

- **后端**：Python + Flask（RESTful 接口、Token 鉴权）
- **前端**：纯 HTML + CSS + JavaScript（原生 DOM + Fetch，无前端框架）
- **数据库**：SQLite（数据文件持久化）
- **部署**：Docker + docker-compose（单命令启动、数据卷持久化）

## 目录结构

```
.
├── app/                      # 后端 Flask 应用
│   ├── __init__.py           # 应用工厂、蓝图注册、静态页面路由
│   ├── config.py             # 配置（数据库路径、预设账号、端口）
│   ├── models.py             # 数据模型（用户/比赛/科目/选手/计分）
│   ├── auth.py               # Token 鉴权逻辑与装饰器
│   ├── services.py           # 计分计算业务逻辑
│   └── routes/               # 接口路由（鉴权/比赛/选手/计分/导出）
├── static/                   # 前端静态文件
│   ├── css/style.css         # 全局样式
│   ├── js/common.js          # 通用工具（Token/Fetch/Toast/模态框）
│   ├── js/{login,home,competition,scoring,history,result}.js
│   └── *.html                # 登录/主页/详情/计分/历史/结果页
├── data/                     # SQLite 数据持久化目录（运行时自动创建）
├── requirements.txt
├── run.py                    # 服务入口
├── Dockerfile
├── docker-compose.yaml
└── README.md
```

## 一、Docker 一键部署（推荐）

确保已安装 Docker 与 docker-compose，在项目根目录执行：

```bash
docker compose up -d --build
```

启动后访问：`http://<服务器IP>:5000`

- 数据库文件持久化在宿主机 `./data/scoring.db`，容器销毁重建不丢数据。
- 端口、账号等均可在 `docker-compose.yaml` 或环境变量中自定义（见下文）。

**自定义端口**（如改为 8000）：

```bash
PORT=8000 docker compose up -d --build
```

**查看日志 / 停止 / 卸载**：

```bash
docker compose logs -f        # 查看日志
docker compose down           # 停止并移除容器
```

## 二、本地开发运行

```bash
pip install -r requirements.txt
python run.py                 # 默认 http://127.0.0.1:5000
# 或使用 gunicorn
gunicorn -w 1 --threads 4 -b 0.0.0.0:5000 run:app
```

## 三、配置项（环境变量）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `5000` | 服务监听端口，compose 中同时控制宿主机映射端口 |
| `PRESET_USERNAME` | `qyjx` | 内置登录用户名 |
| `PRESET_PASSWORD` | `qyjx` | 内置登录密码 |
| `SECRET_KEY` | 内置值 | Flask 会话密钥 |
| `DATA_DIR` | `./data` | SQLite 数据文件目录 |
| `DATABASE_URL` | 自动 | 完整数据库 URI，覆盖 DATA_DIR |

## 四、默认账号

```
用户名：qyjx
密码：  qyjx
```

> Token 永久有效，无过期时间；登出仅清除本地登录态。

## 五、使用指引

1. **登录**：使用默认账号登录，进入系统主页。
2. **新建比赛**：主页点击「新建比赛」，填写基础信息并配置一个或多个评分科目（含满分值）。
3. **管理选手**：进入比赛详情页，添加/编辑/删除选手（姓名必填、备注选填，删除后编号自动重排）。
4. **开始比赛**：主页或详情页点击「开始比赛」，先设置评委总个数，进入计分界面。
5. **录入计分**：
   - 顶部实时显示「评委 X / N」填分进度与实时排行榜。
   - 点击「添加计分」：选择选手 → 选择「手动模式」（逐科目输入）或「快速模式」（输入空格分隔数字，自动提取填充）。
   - 单选手单评委录完后可「保存并录入下一评委」。
   - 未打分评委按 0 分计算，未参赛选手最终分按 0。
6. **计分规则**：可勾选「去掉一个最高分 / 去掉一个最低分」，排行榜实时重算。
7. **分数运维**：已录入分数支持编辑/删除，排行榜实时同步。
8. **结束比赛**：点击「结束比赛」，状态变为「已结束」，关闭录入权限，归入历史记录。
9. **历史记录**：侧边栏「历史比赛记录」查看所有已结束比赛，进入结果页可导出 Excel：
   - **精简版**：名次、选手姓名、最终分数。
   - **详细版**：名次、编号、姓名、备注、各评委分、各科目分、最终得分。
10. **编辑约束**：
    - 比赛进行中：禁止编辑比赛属性与选手信息。
    - 已有计分记录的比赛编辑时：提示「修改后历史比赛记录将被清除」，可选择「覆盖」（清除原计分并保存）或「另存为新比赛」（保留原比赛与记录）。

## 六、接口概览

| 模块 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 鉴权 | POST | `/api/login` | 登录获取 Token |
| 鉴权 | POST | `/api/logout` | 登出 |
| 比赛 | GET/POST | `/api/competitions` | 列表/创建 |
| 比赛 | GET/PUT/DELETE | `/api/competitions/<id>` | 详情/编辑/删除 |
| 比赛 | POST | `/api/competitions/<id>/start` | 开始比赛（设评委数） |
| 比赛 | POST | `/api/competitions/<id>/finish` | 结束比赛 |
| 比赛 | PUT | `/api/competitions/<id>/calc-options` | 去最高/最低分 |
| 比赛 | POST/PUT | `/api/competitions/<id>/next-judge` `/current-judge` | 评委轮次切换 |
| 选手 | POST | `/api/competitions/<id>/players` | 添加选手 |
| 选手 | PUT/DELETE | `/api/players/<id>` | 编辑/删除选手 |
| 计分 | GET/POST | `/api/competitions/<id>/scores` | 查询/录入计分 |
| 计分 | PUT/DELETE | `/api/scores/<id>` | 编辑/删除单条 |
| 计分 | DELETE | `/api/competitions/<id>/scores` | 批量删除（按选手+评委） |
| 计分 | GET | `/api/competitions/<id>/leaderboard` | 实时排行榜 |
| 导出 | GET | `/api/competitions/<id>/export?version=simple\|detailed` | 导出 Excel |

所有 `/api/*` 接口（除 `/api/login`）均需在请求头携带 `Authorization: Bearer <token>`。
