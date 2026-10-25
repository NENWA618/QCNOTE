import Link from 'next/link';
import LegalPage, { type LegalSection } from '../components/LegalPage';

const sections: LegalSection[] = [
  {
    id: 'local-storage',
    title: '本地优先存储',
    body: (
      <p>
        QCNOTE 默认将笔记、设置、标签和搜索索引保存在浏览器本地存储中。如果浏览器支持
        IndexedDB，系统会优先使用它；否则会回退到
        localStorage。这样可确保你在离线状态下也能继续创建和编辑笔记。
      </p>
    ),
  },
  {
    id: 'encryption',
    title: '客户端加密',
    body: (
      <>
        <p>
          QCNOTE 支持在浏览器端对敏感笔记字段启用 AES-GCM
          加密。当前登录用户的数据按账号命名空间隔离保存，若启用加密或提供手动密钥，系统会在本地派生或管理加密密钥。
        </p>
        <p>
          除你主动发布的公开笔记（见第 7 节）外，QCNOTE
          不会将你的密码或明文笔记发送到服务端。请注意，如果浏览器环境不支持
          IndexedDB，系统可能会回退到 localStorage 并以明文形式保存数据。
        </p>
      </>
    ),
  },
  {
    id: 'sync',
    title: '可选云同步',
    body: (
      <>
        <p>
          WebDAV 和 OneDrive 同步均为可选功能，必须由你手动配置后才会启用。QCNOTE
          不会自动启动云同步。
        </p>
        <p>
          云端同步数据的隐私和安全由你所选同步服务提供商负责。若启用了加密，笔记数据会在本地加密后再传输到远程存储。
        </p>
      </>
    ),
  },
  {
    id: 'collection',
    title: '我们收集的数据',
    body: (
      <>
        <p>
          不登录也可以使用笔记功能，此时 QCNOTE 不会在服务器上保存你的任何数据。QCNOTE
          不收集你未公开的笔记内容和账号密码，也不使用第三方分析、广告或追踪服务。
        </p>
        <p>使用 Google、GitHub 或 Discord 登录后，服务器会保存：</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>登录服务提供的用户 ID、用户名、头像和邮箱地址</li>
          <li>你填写的个人简介和主动发布的公开笔记</li>
          <li>活跃记录（热力图、连续活跃天数）和迷宫排行榜成绩</li>
          <li>用于验证登录设备的设备指纹，以及开启推送通知时的推送订阅</li>
          <li>用于加密本地笔记的密钥（经服务器主密钥加密保存，服务器无法凭它读取你的笔记）</li>
        </ul>
        <p>这些数据仅用于提供账号相关功能和保障账号安全，不会出售或与第三方共享。</p>
      </>
    ),
  },
  {
    id: 'export',
    title: '导入与导出',
    body: (
      <p>
        你可以导出笔记为 JSON
        文件以便备份或迁移。导出文件包含完整笔记内容，请妥善保管，并建议存储在受信任的设备或加密存储中。
      </p>
    ),
  },
  {
    id: 'third-party',
    title: '第三方库与依赖',
    body: (
      <p>
        QCNOTE 使用开源前端库（如 React、Tailwind、KaTeX
        等）来构建界面和功能。这些库仅用于本地渲染和运行，不会自动共享你的笔记内容。
      </p>
    ),
  },
  {
    id: 'public-notes',
    title: '个人主页与公开笔记',
    body: (
      <>
        <p>
          登录用户的个人主页（头像、用户名、简介、加入时间）对所有人公开，包括未登录的访客，邮箱不会公开。
        </p>
        <p>
          你可以选择把某篇笔记发布到个人主页。发布是一个主动操作：该笔记的标题、正文、标签和文字颜色会以明文保存在服务器上，任何人都能看到。服务器保存的只是发布时的一份副本，之后修改本地笔记不会自动同步，你可以随时点击“更新发布”。
        </p>
        <p>
          你可以随时“取消发布”，服务器上的副本会被立即删除。未发布的笔记不会上传。公开笔记不会被搜索引擎主动收录，但无法阻止他人复制或转载已被访问的内容；管理员有权下架违规内容。
        </p>
      </>
    ),
  },
  {
    id: 'delete-data',
    title: '账号与数据删除',
    body: (
      <>
        <p>你可以随时删除 QCNOTE 账号及其在服务器上的数据（网页版和安卓 App 相同）：</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            登录后打开{' '}
            <Link href="/profile" className="text-ink-pink hover:underline">
              个人资料
            </Link>{' '}
            页面；
          </li>
          <li>在页面底部找到“注销账号”，按提示确认。</li>
        </ol>
        <p>
          注销后会立即删除：个人资料与公开主页、所有公开笔记、活跃记录、排行榜成绩、推送订阅、设备指纹和笔记加密密钥。其他设备上的登录会话随即失效。
        </p>
        <p>
          为了让旧的登录会话持续失效，我们会保留一条只含用户 ID
          和注销时间的记录，不含其他个人信息。保存在你设备本地或你自己的 WebDAV / OneDrive
          中的笔记不在服务器上，需要你自行删除。
        </p>
        <p>
          如果只想删除部分数据而保留账号：可以在笔记上“取消发布”（服务器上的副本会立即删除）、清空个人简介，或关闭推送通知。无法登录时，也可以通过{' '}
          <Link href="/contact" className="text-ink-pink hover:underline">
            联系页
          </Link>{' '}
          申请删除。
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: '联系我们',
    body: (
      <p>
        如有隐私问题、数据请求或建议，请通过我们的{' '}
        <Link href="/contact" className="text-ink-pink hover:underline">
          联系页
        </Link>{' '}
        与我们取得联系。
      </p>
    ),
  },
];

export default function Privacy() {
  return (
    <LegalPage
      title="隐私政策"
      description="QCNOTE 的隐私政策。了解我们如何保护您的个人数据和笔记内容，强调本地存储和隐私优先的设计理念。"
      updated="2026 年 10 月 14 日"
      related={{ href: '/terms', label: '使用条款' }}
      intro={
        <p>
          QCNOTE
          以“本地优先、隐私优先”为核心设计理念。我们努力将你的个人数据保持在本地设备上，仅在你主动授权的前提下才与外部服务交互。
        </p>
      }
      sections={sections}
    />
  );
}
