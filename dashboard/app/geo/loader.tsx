'use client'

/**
 * Обёртка, чтобы страница грузилась только в браузере.
 *
 * Начиная с Next 15 `ssr: false` нельзя указывать в серверном компоненте, а
 * страница им и является: там же лежит `export const dynamic`. Поэтому сам
 * вызов переехал сюда, в клиентский модуль, — поведение прежнее, страница
 * по-прежнему не рисуется на сервере.
 */

import loadDynamic from 'next/dynamic'

export default loadDynamic(() => import('./GeoClient'), { ssr: false })
