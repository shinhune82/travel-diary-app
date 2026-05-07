import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'
import { getStorage, ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'

const firebaseConfig = {
  apiKey:            "AIzaSyC1fHiws9vm_9Ua_pOOoAex0Ne6eLTMdAo",
  authDomain:        "travel-diary-1e61a.firebaseapp.com",
  projectId:         "travel-diary-1e61a",
  storageBucket:     "travel-diary-1e61a.firebasestorage.app",
  messagingSenderId: "410252582708",
  appId:             "1:410252582708:web:8c68183bf6e26b23960f61"
}

const app = initializeApp(firebaseConfig)
export const db      = getFirestore(app)
export const storage = getStorage(app)
const COL = 'eden_journal'

/* ── localStorage + Firebase 저장 ── */
function lsGet(k)   { try { return localStorage.getItem(k) } catch { return null } }
function lsSet(k,v) { try { localStorage.setItem(k,v) } catch {} }

export async function storageGet(key) {
  const local = lsGet(key)
  try {
    const snap = await getDoc(doc(db, COL, key))
    if (snap.exists()) {
      const value = snap.data().value
      lsSet(key, value)
      return value
    }
  } catch(e) { console.warn('Firebase 읽기 실패:', e) }
  return local
}

export async function storageSet(key, value) {
  lsSet(key, value)
  try { await setDoc(doc(db, COL, key), { value }) }
  catch(e) { console.warn('Firebase 쓰기 실패:', e) }
}

/* ── 이미지 압축 (Canvas) ── */
export async function compressImage(file, maxW=800, maxH=600, quality=0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      let w = img.width, h = img.height
      // 비율 유지하며 축소
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW }
      if (h > maxH) { w = Math.round(w * maxH / h); h = maxH }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('압축 실패')),
        'image/jpeg', quality
      )
    }
    img.onerror = () => reject(new Error('이미지 로드 실패'))
    img.src = url
  })
}

/* ── 방문별 사진 업로드 (진행률 지원) ── */
export async function uploadVisitPhoto(tripId, visitId, file, onProgress) {
  // 1단계: 압축
  onProgress?.({ stage:'compress', pct:0 })
  const compressed = await compressImage(file)
  const kb = Math.round(compressed.size / 1024)
  console.log(`압축 완료: ${Math.round(file.size/1024)}KB → ${kb}KB`)
  onProgress?.({ stage:'compress', pct:100 })

  // 2단계: 업로드
  const storageRef = ref(storage, `trips/${tripId}/visits/${visitId}/photo.jpg`)
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, compressed, { contentType:'image/jpeg' })
    task.on('state_changed',
      snap => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
        onProgress?.({ stage:'upload', pct })
      },
      reject,
      async () => {
        const url = await getDownloadURL(task.snapshot.ref)
        resolve(url)
      }
    )
  })
}

/* ── 방문별 사진 삭제 ── */
export async function deleteVisitPhoto(tripId, visitId) {
  try {
    const storageRef = ref(storage, `trips/${tripId}/visits/${visitId}/photo.jpg`)
    await deleteObject(storageRef)
  } catch(e) { console.warn('사진 삭제 실패:', e) }
}
