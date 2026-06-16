import loadDynamic from 'next/dynamic'
export const dynamic = 'force-static'
export default loadDynamic(() => import('./CohortsClient'), { ssr: false })
