import Head from 'next/head';
import Link from 'next/link';
import React from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';

export default function Terms() {
  return (
    <>
      <Head>
        <title>使用条款 - QCNOTE</title>
        <meta name="description" content="QCNOTE 的使用条款和服务协议。了解使用本应用的规则、责任和知识产权声明。" />
      </Head>

      <Header />

      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-primary-dark mb-4">使用条款</h1>

        <div className="card">
          <p className="text-text-light leading-relaxed mb-4">
            欢迎使用 QCNOTE。使用本应用即表示你同意以下使用条款。请在使用前仔细阅读。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">1. 使用范围</h2>
          <p className="text-text-light mb-4">
            QCNOTE 为个人笔记管理工具，提供在本地创建、编辑、导出和导入笔记的功能。你应对自己在应用中创建的内容负责。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">2. 免责声明</h2>
          <p className="text-text-light mb-4">
            本软件按 “现状” 提供，不对因使用或无法使用本软件而产生的问题承担责任。请自行备份重要数据。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">3. 知识产权</h2>
          <p className="text-text-light mb-4">
            QCNOTE 的源代码遵循仓库内声明的 MIT 许可证。你可以在遵守许可条款的前提下使用、修改和分发本项目。
            <br />
            （看板娘模型当前使用来自 <code>live2d-widget-model-koharu</code> 的开源资产，
            该模型以 GPL‑2.0 授权，与项目代码的 MIT 许可不同。使用时请自行评估
            可能的合规要求。）
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">4. 修改与终止</h2>
          <p className="text-text-light mb-4">
            我们保留在任何时间修改或终止服务的权利。对服务的任何变更将在项目仓库或网站公告中说明。
          </p>

          <h2 className="text-lg font-semibold text-primary-dark mt-4 mb-2">5. 联系我们</h2>
          <p className="text-text-light mb-4">
            如有问题或需要法律相关说明，请访问我们的 <Link href="/contact" className="text-accent-pink hover:underline">联系页</Link>。
          </p>

          <p className="text-text-light text-sm mt-6">最后更新：2026 年 2 月 26 日</p>
        </div>
      </main>

      <Footer />
    </>
  );
}
