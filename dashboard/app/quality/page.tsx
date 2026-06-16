import dynamic from 'next/dynamic'
export default dynamic(() => import('./QualityClient'), { ssr: false })
