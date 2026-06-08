/** @type {import('next').NextConfig} */
const isGhPages = process.env.DEPLOY_TARGET === 'ghpages'

const nextConfig = {
  ...(isGhPages ? { output: 'export', trailingSlash: true } : {}),
  basePath: isGhPages ? '/JobToo' : '',
  assetPrefix: isGhPages ? '/JobToo/' : '',
}
module.exports = nextConfig
