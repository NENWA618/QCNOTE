import Link from 'next/link';
import LegalPage, { type LegalSection } from '../components/LegalPage';

const sections: LegalSection[] = [
  {
    id: 'service',
    title: '服务内容',
    body: (
      <p>
        QCNOTE 提供个人笔记管理功能，包括本地笔记编辑、Markdown/LaTeX
        渲染、双链关联、知识图谱、版本历史、搜索和个人主页。应用核心功能在本地运行，云同步为可选扩展。
      </p>
    ),
  },
  {
    id: 'user-content',
    title: '用户内容与责任',
    body: (
      <p>
        你对在 QCNOTE
        中创建、导入、保存或同步的内容负全部责任。你承诺所发布或存储的内容为合法内容，不侵犯他人权益，并遵守适用法律法规。
      </p>
    ),
  },
  {
    id: 'backup',
    title: '数据保管与备份',
    body: (
      <p>
        QCNOTE 默认将数据保存在用户设备本地，并优先使用
        IndexedDB。若启用加密，系统会在本地对敏感字段使用 AES-GCM 进行保护。
        如果未启用加密或出现存储降级，数据可能会以明文形式保存于浏览器本地。
        你应自行备份重要数据，因设备故障、浏览器问题或误操作导致的数据丢失，QCNOTE 不承担责任。
      </p>
    ),
  },
  {
    id: 'sync',
    title: '同步与第三方服务',
    body: (
      <>
        <p>
          WebDAV 和 OneDrive 同步需由你主动配置。相关数据传输和存储由第三方服务提供商负责，QCNOTE
          对第三方服务的隐私政策、安全措施或服务可用性不承担责任。
        </p>
        <p>
          同步加密为可选配置。若启用同步加密，QCNOTE 会在本地对待传输内容进行 AES-GCM
          加密；若未启用，则同步数据以明文形式传输。
        </p>
      </>
    ),
  },
  {
    id: 'license',
    title: '知识产权',
    body: (
      <>
        <p>
          QCNOTE 源代码遵循项目仓库中的 MIT
          许可证。你可以在遵守该许可证的前提下使用、修改和分发源代码。
        </p>
        <p>应用中使用的第三方开源组件可能具有独立授权协议，使用时请遵循其各自授权条款。</p>
      </>
    ),
  },
  {
    id: 'disclaimer',
    title: '免责声明',
    body: (
      <p>
        本软件按“现状”提供，不作任何明示或暗示的担保。QCNOTE
        不保证软件适用于特定目的，也不保证其持续可用性或错误修复。
      </p>
    ),
  },
  {
    id: 'liability',
    title: '责任限制',
    body: (
      <p>
        在适用法律允许的最大范围内，QCNOTE
        不对任何间接、附带、特殊、惩罚性或继发性的损失承担责任，包括但不限于利润损失、数据丢失或业务中断。
      </p>
    ),
  },
  {
    id: 'changes',
    title: '条款变更',
    body: (
      <p>
        我们可随时更新使用条款。条款更新后继续使用 QCNOTE
        即视为你已接受修改。重大变更我们会在官方渠道或项目仓库中公布说明。
      </p>
    ),
  },
  {
    id: 'contact',
    title: '联系我们',
    body: (
      <p>
        如对条款有疑问，请访问我们的{' '}
        <Link href="/contact" className="text-ink-pink hover:underline">
          联系页
        </Link>{' '}
        获取支持。
      </p>
    ),
  },
];

export default function Terms() {
  return (
    <LegalPage
      title="使用条款"
      description="QCNOTE 的使用条款和服务协议。了解使用本应用的规则、责任和知识产权声明。"
      updated="2026 年 5 月 21 日"
      related={{ href: '/privacy', label: '隐私政策' }}
      intro={
        <p>
          欢迎使用
          QCNOTE。本使用条款适用于你对本应用及其相关功能的访问和使用。继续使用即表示你已阅读并接受这些条款。
        </p>
      }
      sections={sections}
    />
  );
}
