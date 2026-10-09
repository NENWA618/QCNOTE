#!/bin/bash

# QCNOTE 备份脚本
# 每日自动备份 PostgreSQL 和 Redis 数据

set -e

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# 创建备份目录
mkdir -p $BACKUP_DIR

echo "开始备份 - $DATE"

# PostgreSQL 备份
echo "备份 PostgreSQL..."
PGPASSWORD=$POSTGRES_PASSWORD pg_dump \
  -h $POSTGRES_HOST \
  -U $POSTGRES_USER \
  -d $POSTGRES_DB \
  --format=custom \
  --compress=9 \
  --file=$BACKUP_DIR/postgres_$DATE.backup

# Redis 备份 (如果使用 RDB 快照)
echo "备份 Redis..."
redis-cli -h $REDIS_HOST -p $REDIS_PORT --rdb $BACKUP_DIR/redis_$DATE.rdb

# 压缩备份
echo "压缩备份文件..."
tar -czf $BACKUP_DIR/full_backup_$DATE.tar.gz -C $BACKUP_DIR postgres_$DATE.backup redis_$DATE.rdb

# 清理旧备份
echo "清理 $RETENTION_DAYS 天前的备份..."
find $BACKUP_DIR -name "*.backup" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.rdb" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "备份完成 - $DATE"
echo "备份位置: $BACKUP_DIR/full_backup_$DATE.tar.gz"

# 可选：上传到云存储
# aws s3 cp $BACKUP_DIR/full_backup_$DATE.tar.gz s3://your-bucket/backups/

# 发送通知 (如果配置了)
# curl -X POST -H 'Content-type: application/json' \
#   --data '{"text":"QCNOTE 备份完成"}' \
#   $SLACK_WEBHOOK_URL