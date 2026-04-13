# 管理员设置指南

## 问题说明

QCNOTE目前只支持OAuth登录（Google、GitHub、Discord），不支持传统的邮箱注册。这导致了一个问题：如何为OAuth用户设置管理员权限？

## 解决方案

我们提供了多种方法来设置管理员：

### 方法一：通过管理员面板设置（推荐）

1. **已有管理员登录**
   - 如果你已经有一个管理员账户，登录后访问 `/admin`

2. **设置新管理员**
   - 在管理员面板中点击"设置管理员"按钮
   - 输入用户的OAuth邮箱地址（如 `user@gmail.com`）
   - 可选：输入用户名（不填则自动从邮箱生成）
   - 点击"设置为管理员"

3. **自动创建用户**
   - 如果用户还没有登录过系统，会自动创建用户账户
   - 然后设置管理员权限

### 方法二：使用命令行脚本

```bash
# 设置现有用户为管理员
node scripts/setup-admin.mjs user@gmail.com

# 创建新用户并设置为管理员
node scripts/setup-admin.mjs user@gmail.com "用户名"

# 通过用户ID设置（如果知道ID）
node scripts/setup-admin.mjs user-uuid-here
```

### 方法三：数据库直接操作

如果你有数据库访问权限，可以直接在数据库中设置：

```sql
-- 更新用户角色
UPDATE user_roles SET role = 'admin' WHERE user_id = '用户ID';

-- 或者插入新记录
INSERT INTO user_roles (user_id, role, updated_by, updated_at)
VALUES ('用户ID', 'admin', 'system', NOW());
```

## OAuth用户邮箱获取

### Google账户
- 邮箱格式：`username@gmail.com`
- 显示在Google账户设置中

### GitHub账户
- 邮箱格式：`username@github.com` 或个人邮箱
- 在GitHub Settings > Emails中查看

### Discord账户
- 邮箱格式：注册时使用的邮箱
- 在Discord User Settings > My Account中查看

## 验证管理员设置

设置完成后：

1. **重新登录** - 刷新页面或重新登录
2. **检查导航栏** - 应该出现红色的"管理员"链接
3. **访问管理员面板** - 访问 `/admin` 查看用户管理界面
4. **论坛角色显示** - 在论坛帖子中应该显示管理员徽章

## 注意事项

- **首次登录**：OAuth用户必须先登录一次才能在数据库中创建记录
- **邮箱准确性**：确保使用用户实际的OAuth邮箱地址
- **权限检查**：只有现有管理员可以设置新管理员
- **安全**：管理员权限应该谨慎授予

## 故障排除

### 用户不存在错误
- 确认邮箱地址正确
- 用户可能还没有登录过，尝试通过管理员面板创建

### 权限拒绝错误
- 确认你自己是管理员
- 检查数据库中的user_roles表

### 登录后不显示管理员链接
- 清除浏览器缓存
- 重新登录
- 检查Header组件中的角色获取逻辑