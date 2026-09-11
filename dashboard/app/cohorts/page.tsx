export const dynamic = 'force-static'

// Сам компонент — в ./loader: он клиентский, потому что отключение серверной
// отрисовки (ssr: false) с Next 15 доступно только в клиентском модуле.
export { default } from './loader'
