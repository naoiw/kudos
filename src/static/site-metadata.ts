interface ISiteMetadataResult {
  siteTitle: string;
  siteUrl: string;
  description: string;
  logo: string;
  navLinks: {
    name: string;
    url: string;
  }[];
}

const getBasePath = () => {
  const baseUrl = import.meta.env.BASE_URL;
  return baseUrl === '/' ? '' : baseUrl;
};

const data: ISiteMetadataResult = {
  siteTitle: 'Kudos',
  siteUrl: 'https://naoiw.github.io/kudos/',
  logo: '',
  description: 'ランニングとサイクリングのアクティビティ記録',
  navLinks: [
    {
      name: '集計',
      url: `${getBasePath()}/summary`,
    },
    {
      name: 'GitHub',
      url: 'https://github.com/naoiw/kudos',
    },
    {
      name: '元プロジェクト',
      url: 'https://github.com/yihong0618/running_page/blob/master/README-CN.md',
    },
  ],
};

export default data;
