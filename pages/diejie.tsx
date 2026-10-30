import Head from 'next/head';
import type { NextPage } from 'next';
import DiejieGame from '../components/diejie/DiejieGame';
import DiejieStyles from '../components/diejie/DiejieStyles';

const DiejiePage: NextPage = () => (
  <>
    <Head>
      <title>叠界 · 光域迷宫</title>
    </Head>
    <DiejieGame />
    <DiejieStyles />
  </>
);

export default DiejiePage;
