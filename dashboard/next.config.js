/** @type {import('next').NextConfig} */
const isProd = process.env.DEPLOY_TARGET === 'ghpages'

const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: isProd ? '/JobMatch' : '',
  assetPrefix: isProd ? '/JobMatch/' : '',
}
module.exports = nextConfig
