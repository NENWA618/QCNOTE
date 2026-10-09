-- 清除历史上自动写入的 dicebear 默认头像。
-- 此前 createUserProfile / setup-admin 会给每个新用户写入
-- https://api.dicebear.com/7.x/avataaars/svg?seed=<用户名>；现在未设置头像统一存空字符串，
-- 前端显示渐变圆形 + 用户名首字母。用户自己填写的头像地址不受影响。
-- Run this migration on your PostgreSQL database（可重复执行）

BEGIN;

UPDATE users
SET image = ''
WHERE image LIKE 'https://api.dicebear.com/%';

-- 叠界排行榜提交记录里冗余保存了一份头像
-- maze_submissions 由后端首次使用时才建表，可能还不存在，所以先判断
DO $$
BEGIN
  IF to_regclass('public.maze_submissions') IS NOT NULL THEN
    UPDATE maze_submissions
    SET avatar = ''
    WHERE avatar LIKE 'https://api.dicebear.com/%';
  END IF;
END
$$;

COMMIT;

-- 执行后还需要清 Redis 里的缓存，否则旧头像会继续从缓存读出（缓存没有过期时间）：
--   用户资料：  user:<userId>:profile
--   排行榜信息：leaderboard:<leaderboardKey>:<userId>:info
-- 例如：
--   redis-cli --scan --pattern 'user:*:profile' | xargs -r redis-cli del
--   redis-cli --scan --pattern 'leaderboard:*:info' | xargs -r redis-cli del
-- 缓存会在下次读取时从数据库重建。
