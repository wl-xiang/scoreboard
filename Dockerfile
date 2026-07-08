# 比赛计分管理系统 - 镜像构建文件
FROM python:3.11-slim

LABEL maintainer="qyjx"

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=5000 \
    DATA_DIR=/app/data \
    PIP_NO_CACHE_DIR=1

# 安装依赖（利用层缓存）
COPY requirements.txt .
RUN pip install -r requirements.txt gunicorn

# 拷贝项目代码
COPY . .

# 数据持久化目录
RUN mkdir -p /app/data

EXPOSE 5000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:${PORT}/', timeout=3)" || exit 1

# 使用 gunicorn 启动（单 worker + 多线程，适配 SQLite 并发）
CMD ["sh", "-c", "gunicorn -w 1 --threads 8 --timeout 120 -b 0.0.0.0:${PORT} run:app"]
