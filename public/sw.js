const CACHE = 'eden-travel-v1'
const PRECACHE = ['./', './index.html']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  // Firebase / Nominatim / OSM 요청은 캐시하지 않음
  const url = e.request.url
  if (
    url.includes('firestore') ||
    url.includes('firebase') ||
    url.includes('nominatim') ||
    url.includes('openstreetmap') ||
    url.includes('tile.openstreetmap')
  ) {
    return
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(res => {
        // 정적 파일만 캐시에 저장
        if (e.request.method === 'GET' && res.status === 200) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
    }).catch(() => caches.match('./index.html'))
  )
})
