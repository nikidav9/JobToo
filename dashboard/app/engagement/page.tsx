import dynamic from 'next/dynamic'
export default dynamic(() => import('./EngagementClient'), { ssr: false })
