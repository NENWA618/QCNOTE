import Head from 'next/head';
import Link from 'next/link';
import React from 'react';
import Layout from '../components/Layout';

export default function Terms() {
  return (
    <>
      <Head>
        <title>使用条款 - QCNOTE</title>
        <meta name="description" content="QCNOTE 的使用条款和服务协议。了解使用本应用的规则、责任和知识产权声明。" />
      </Head>

      <Layout>
          <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-primary-dark mb-4">使用条款</h1>

        <div className="card">
          <p className="text-text-light leading-relaxed mb-4">
            欢迎使用 QCNOTE。使用本应用即表示你接受以下使用条款。请在开始使用前仔细阅读并理解这些条款。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">1. 服务描述</h2>
          <p className="text-text-light mb-4">
            QCNOTE 是一款个人笔记管理工具，提供本地创建、编辑、导出、导入和搜索笔记的功能。应用支持 Markdown、LaTeX、双链、版本历史和知识图谱等特性。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">2. 用户内容</h2>
          <p className="text-text-light mb-4">
            你对在 QCNOTE 中生成、保存、导入或同步的内容负全部责任。你保证拥有所创建内容的合法权利，并遵守适用法律法规。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">3. 数据责任</h2>
          <p className="text-text-light mb-4">
            QCNOTE 主要通过浏览器本地存储保存数据。你应自行备份重要笔记内容，并妥善保管同步配置。对于因设备故障、浏览器问题或用户操作导致的数据丢失，我们不承担责任。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">4. 同步服务</h2>
          <p className="text-text-light mb-4">
            当你启用 WebDAV 或 OneDrive 同步时，相关数据将根据你的配置传输到第三方服务。第三方服务的隐私政策和安全措施由其提供商负责，QCNOTE 仅提供同步功能，不对第三方服务的数据处理结果承担责任。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">5. 免责声明</h2>
          <p className="text-text-light mb-4">
            本软件按“现状”提供，不对其适用性、可用性、性能或结果做出任何明示或暗示的保证。你使用本软件所产生的风险由你自行承担。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">6. 责任限制</h2>
          <p className="text-text-light mb-4">
            在适用法律允许的最大范围内，QCNOTE 不对任何间接、附带、特殊、惩罚性或继发性的损失承担责任，包括但不限于利润损失、数据丢失或业务中断。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">7. 知识产权</h2>
          <p className="text-text-light mb-4">
            QCNOTE 的源代码遵循仓库内声明的 MIT 许可证。你可以在遵守该许可证条款的前提下使用、修改和分发本项目。
          </p>
          <p className="text-text-light mb-4">
            应用中可能使用部分第三方开源素材，例如 Live2D 模型《koharu》，其授权许可可能与 MIT 许可不同。使用或分发这些素材时，请遵守相应授权条款。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">8. 修改与终止</h2>
          <p className="text-text-light mb-4">
            我们保留在任何时间修改、暂停或停止提供本软件及相关服务的权利。对服务的任何重大变更或新增条款，我们将在项目仓库或官方页面中公布说明。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">9. 联系我们</h2>
          <p className="text-text-light mb-4">
            如有条款解释或法律问题，请访问我们的 <Link href="/contact" className="text-accent-pink hover:underline">联系页</Link> 获取支持。
          </p>

          <p className="text-text-light text-sm mt-6">最后更新：2026 年 5 月 7 日</p>
        </div>
      </main>
      </Layout>
    </>
  );
}
