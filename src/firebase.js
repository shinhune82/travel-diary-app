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

export async function storageGet(key) {
  try {
    const snap = await getDoc(doc(db, COL, key))
    return snap.exists() ? snap.data().value : null
  } catch (e) {
    console.warn('storageGet error', e)
    return null
  }
}

export async function storageSet(key, value) {
  try {
    await setDoc(doc(db, COL, key), { value })
  } catch (e) {
    console.warn('storageSet error', e)
  }
}
