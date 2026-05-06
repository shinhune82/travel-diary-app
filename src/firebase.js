import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            "AIzaSyC1fHiws9vm_9Ua_pOOoAex0Ne6eLTMdAo",
  authDomain:        "travel-diary-1e61a.firebaseapp.com",
  projectId:         "travel-diary-1e61a",
  storageBucket:     "travel-diary-1e61a.firebasestorage.app",
  messagingSenderId: "410252582708",
  appId:             "1:410252582708:web:8c68183bf6e26b23960f61"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
const COL = 'eden_journal'

// localStorage를 1차 저장소로, Firebase를 2차(클라우드 백업)로 사용
export async function storageGet(key) {
  // 1. 먼저 localStorage에서 즉시 읽기
  const local = localStorage.getItem(key)

  // 2. Firebase에서도 읽기 시도 (클라우드 최신값 반영)
  try {
    const snap = await getDoc(doc(db, COL, key))
    if (snap.exists()) {
      const value = snap.data().value
      localStorage.setItem(key, value) // 로컬 캐시 갱신
      return value
    }
  } catch (e) {
    console.warn('Firebase 읽기 실패, localStorage 사용:', e)
  }

  return local
}

export async function storageSet(key, value) {
  // 1. localStorage에 즉시 저장 (오프라인도 OK)
  localStorage.setItem(key, value)

  // 2. Firebase에도 저장 시도
  try {
    await setDoc(doc(db, COL, key), { value })
  } catch (e) {
    console.warn('Firebase 쓰기 실패, localStorage에만 저장:', e)
  }
}
