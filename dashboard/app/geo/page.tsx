import dynamic from 'next/dynamic'
export default dynamic(() => import('./GeoClient'), { ssr: false })
