import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';
import Layout from '../components/Layout';

const Contact: React.FC = () => {
  return (
    <>
      <Head>
        <title>联系我们 - QCNOTE</title>
        <meta name="description" content="联系 QCNOTE 团队。反馈建议、问题报告、合作洽谈等。我们期待听到你的声音！" />
      </Head>

      <Layout footerLayout="full">
        <section className="text-center py-12">
          <h1 className="text-5xl font-bold text-primary-dark mb-4">📧 联系我们</h1>
          <p className="text-xl text-text-light">我们期待听到你的声音！反馈、建议、问题都欢迎。</p>
        </section>

        <section className="my-12">
          <div className="max-w-3xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
              <div className="card text-center">
                <h2 className="text-primary-dark mb-4 text-2xl font-bold">📧 邮件反馈</h2>
                <p className="text-text-light mb-6">
                  有任何问题、建议或合作想法？直接发邮件告诉我们。
                </p>
                <a 
                  href="mailto:i24026878@student.newinti.edu.my"
                  className="btn btn-primary inline-block"
                >
                  发送邮件
                </a>
                <p className="text-text-light text-sm mt-4">
                  📬 i24026878@student.newinti.edu.my
                </p>
              </div>

              <div className="card text-center">
                <h2 className="text-primary-dark mb-4 text-2xl font-bold">🐙 GitHub</h2>
                <p className="text-text-light mb-6">
                  查看源代码、提交 Issue、贡献代码。
                </p>
                <a 
                  href="https://github.com/NENWA618/QCNOTE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary inline-block"
                >
                  访问仓库
                </a>
                <p className="text-text-light text-sm mt-4">
                  🔗 NENWA618/QCNOTE
                </p>
              </div>
            </div>

            <div className="card mb-12">
              <h2 className="text-primary-dark mb-6 text-2xl font-bold">💡 反馈方式</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h3 className="text-accent-pink font-bold mb-3">🐛 Bug 报告</h3>
                  <p className="text-text-light">
                    发现应用中的问题？请在 GitHub Issues 中详细描述问题和重现步骤。
                  </p>
                </div>
                <div>
                  <h3 className="text-accent-pink font-bold mb-3">💬 功能建议</h3>
                  <p className="text-text-light">
                    有新想法或功能建议？我们欢迎在 GitHub Discussions 中讨论。
                  </p>
                </div>
                <div>
                  <h3 className="text-accent-pink font-bold mb-3">❓ 问题咨询</h3>
                  <p className="text-text-light">
                    遇到使用问题？可以直接邮件或在 GitHub Discussions 中提问。
                  </p>
                </div>
              </div>
            </div>

            <div className="card text-center">
              <h2 className="text-primary-dark mb-4 text-2xl font-bold">🎁 打赏支持</h2>
              <p className="text-text-light mb-6">
                感谢你对 QCNOTE 的喜爱。<br />
                如果觉得有帮助，欢迎扫码通过 TNG 支持我们。
              </p>
              <div className="mx-auto max-w-xs">
                <Image
                  src="/tngqr.png"
                  alt="TNG 收款二维码"
                  width={320}
                  height={320}
                  className="mx-auto rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                />
              </div>
              <p className="text-text-light text-sm mt-4">
                💳 TNG 转账
              </p>
            </div>
          </div>
        </section>

        <section className="my-12 text-center">
          <div
            className="card"
            style={{
              background:
                'linear-gradient(135deg, rgba(220, 150, 180, 0.1), rgba(176, 168, 192, 0.1))',
            }}
          >
            <h2 className="text-primary-dark mb-4 text-3xl font-bold">🚀 开始使用 QCNOTE</h2>
            <p className="text-text-light text-lg leading-relaxed">
              不管你是否有反馈，都欢迎现在就开始使用 QCNOTE。我们期待为你提供最好的笔记体验！
            </p>
          </div>
        </section>
      </Layout>
    </>
  );
};

export default Contact;
