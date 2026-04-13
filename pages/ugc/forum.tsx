import { GetServerSideProps } from 'next';

export default function ForumRedirectPage() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/forum',
      permanent: false,
    },
  };
};
