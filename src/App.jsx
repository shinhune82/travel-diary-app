import { useState, useEffect, useRef, Component } from 'react'
import { storageSet } from './firebase.js'

/* ─── 상수 ──────────────────────────────────────────── */
const STORAGE_KEY   = 'eden_travel_journal_v4'
const SHORTCUTS_KEY   = 'eden_map_shortcuts_v1'
const DEFAULT_SC_KEY  = 'eden_map_default_sc'
const DEFAULT_SHORTCUTS = [
  { id:'world',  label:'🌍 세계',   lat:30,    lng:20,     zoom:2  },
  { id:'korea',  label:'🇰🇷 한국',   lat:36.5,  lng:127.8,  zoom:7  },
  { id:'japan',  label:'🇯🇵 일본',   lat:35.68, lng:139.69, zoom:8  },
  { id:'france', label:'🇫🇷 프랑스',  lat:48.85, lng:2.35,   zoom:10 },
]
const EMOJIS = ['🏖️','🏔️','🎡','🌊','🏯','🗼','🌸','🍜','🏕️','🎪','⛩️','🌋','🏝️','🎠','🦁','🎋','🌺','🏄','🎑','🦋','🐋','🌾','🍁','⛷️','🎢','🗿','🏟️','🎭','🎨','🍣']
const COLORS  = ['#8B0000','#1a3a5c','#2d5a16','#4a1060','#7a3900','#0a4a3a','#5c2d00','#1a1a4e','#7a1f1f','#004d40','#5a3060','#1a4a2a']

/* ─── localStorage 헬퍼 ─────────────────────────────── */
function lsGet(key) { try { return localStorage.getItem(key) } catch { return null } }
function lsSet(key, val) { try { localStorage.setItem(key, val) } catch {} }

/* ─── 데이터 헬퍼 ───────────────────────────────────── */
function migrate(trips) {
  return trips.map(t => {
    if (t.visits && t.visits.length > 0) return t
    return { ...t, visits:[{id:Date.now()+Math.random(), date:t.date||'', memo:t.description||''}], date:undefined, description:undefined }
  })
}
function latestDate(trip) {
  if (!trip.visits?.length) return trip.date||''
  return [...trip.visits].sort((a,b)=>(b.dateTo||b.date).localeCompare(a.dateTo||a.date))[0].dateTo || [...trip.visits].sort((a,b)=>(b.dateTo||b.date).localeCompare(a.dateTo||a.date))[0].date
}
function formatVisitDate(v) {
  if (!v) return ''
  if (v.dateTo && v.dateTo !== v.date) return `${v.date} ~ ${v.dateTo}`
  return v.date
}

/* ─── 저장 ──────────────────────────────────────────── */
function saveTripsLocal(trips) {
  lsSet(STORAGE_KEY, JSON.stringify(trips))
  storageSet(STORAGE_KEY, JSON.stringify(trips)).catch(()=>{})
}
function saveShortcutsLocal(sc) {
  lsSet(SHORTCUTS_KEY, JSON.stringify(sc))
  storageSet(SHORTCUTS_KEY, JSON.stringify(sc)).catch(()=>{})
}

/* ─── Geocoding ─────────────────────────────────────── */
async function geocode(query) {
  try {
    const isKorean = /[가-힣]/.test(query)
    const p = new URLSearchParams({q:query,format:'json',limit:'1',addressdetails:'1'})
    const res = await fetch('https://nominatim.openstreetmap.org/search?'+p,
      {headers:{'Accept-Language':isKorean?'ko,en':'en'}})
    const data = await res.json()
    if (!data.length) return {error:'not_found'}
    const r=data[0], parts=r.display_name.split(',')
    return {lat:parseFloat(r.lat),lng:parseFloat(r.lon),name:parts[0].trim(),address:parts.slice(1,4).join(',').trim()}
  } catch { return {error:'network_error'} }
}



/* ─── Leaflet 로더 ─────────────────────────────────── */
function useLeaflet() {
  const [ready, setReady] = useState(!!window.L)
  useEffect(() => {
    if (window.L) { setReady(true); return }
    if (!document.getElementById('lf-css')) {
      const lk = document.createElement('link')
      lk.id='lf-css'; lk.rel='stylesheet'
      lk.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
      document.head.appendChild(lk)
    }
    const sc = document.createElement('script')
    sc.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
    sc.onload=()=>setReady(true)
    sc.onerror=()=>console.warn('Leaflet 로드 실패')
    document.head.appendChild(sc)
  }, [])
  return ready
}

/* ─── 공통 스타일 ───────────────────────────────────── */
const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #dbc9aa', borderRadius:4, background:'#fffdf5', fontSize:14, fontFamily:'serif', color:'#2c1500', outline:'none', boxSizing:'border-box' }
function Field({label,children}) {
  return <div><div style={{fontSize:10,color:'#9a7a5a',marginBottom:5,letterSpacing:'0.06em',textTransform:'uppercase'}}>{label}</div>{children}</div>
}

/* ─── 장소 검색 ─────────────────────────────────────── */
function PlaceSearch({value, onSelect}) {
  const [q, setQ]         = useState(value||'')
  const [busy, setBusy]   = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr]     = useState('')

  const search = async () => {
    if (!q.trim()) return
    setBusy(true); setResult(null); setErr('')
    const r = await geocode(q)
    setBusy(false)
    if (r.error) { setErr('장소를 찾지 못했어요.\n예) "창경궁 종로", "해운대 부산"') }
    else { setResult(r); onSelect({location:r.name+(r.address?`, ${r.address}`:''), lat:r.lat, lng:r.lng}) }
  }
  const clear = () => { setQ(''); setResult(null); setErr(''); onSelect({location:'',lat:37.5665,lng:126.9780}) }

  return (
    <div>
      <div style={{display:'flex',gap:6}}>
        <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()}
          placeholder="예: 창경궁, 경복궁, 해운대, Tokyo Tower" style={{...inp,flex:1}}/>
        {result
          ? <button onClick={clear} style={{background:'#9a7a5a',color:'#fff',border:'none',borderRadius:4,padding:'9px 14px',fontSize:13,cursor:'pointer'}}>✕</button>
          : <button onClick={search} disabled={busy||!q.trim()} style={{background:'#2c1500',color:'#f5c842',border:'none',borderRadius:4,padding:'9px 14px',fontSize:13,cursor:'pointer',opacity:busy||!q.trim()?0.5:1}}>
              {busy?'⏳':'검색'}
            </button>
        }
      </div>
      {err && <div style={{marginTop:7,background:'#fff5f0',border:'1px solid #f5b8a0',borderRadius:4,padding:'9px 12px',fontSize:12,color:'#c0392b',whiteSpace:'pre-line'}}>{err}</div>}
      {result && (
        <div style={{marginTop:7,background:'#edf7e0',border:'1px solid #a8d880',borderRadius:4,padding:'9px 12px',fontSize:12,color:'#2c1500',display:'flex',gap:8}}>
          <span>📍</span>
          <div>
            <div style={{fontWeight:700}}>{result.name}</div>
            {result.address&&<div style={{color:'#5a7a3a'}}>{result.address}</div>}
            <div style={{color:'#9a7a5a',fontSize:11}}>위도 {result.lat?.toFixed(4)} · 경도 {result.lng?.toFixed(4)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── 방문 타임라인 ─────────────────────────────────── */
function VisitTimeline({trip, onUpdate}) {
  const [adding, setAdding]     = useState(false)
  const [rangeMode, setRange]   = useState(false)
  const [newDate, setNewDate]   = useState('')
  const [newDateTo, setNewTo]   = useState('')
  const [newMemo, setNewMemo]   = useState('')
  const [editId, setEditId]     = useState(null)
  const [editMemo, setEditMemo] = useState('')

  const rawVisits = (trip.visits && trip.visits.length>0) ? trip.visits : [{id:'fallback',date:trip.date||'',memo:''}]
  const visits    = [...rawVisits].sort((a,b)=>(b.dateTo||b.date||'').localeCompare(a.dateTo||a.date||''))

  const addVisit = () => {
    if (!newDate) return
    const v = {id:Date.now(), date:newDate, memo:newMemo}
    if (rangeMode && newDateTo && newDateTo>newDate) v.dateTo=newDateTo
    onUpdate({...trip, visits:[...rawVisits, v]})
    setAdding(false); setRange(false); setNewDate(''); setNewTo(''); setNewMemo('')
  }
  const saveEdit = id => {
    onUpdate({...trip, visits:rawVisits.map(v=>v.id===id?{...v,memo:editMemo}:v)})
    setEditId(null)
  }
  const delVisit = id => {
    if (rawVisits.length<=1) return
    onUpdate({...trip, visits:rawVisits.filter(v=>v.id!==id)})
  }

  return (
    <div style={{marginBottom:14}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
        <div style={{fontSize:12,color:'#4a2800',fontWeight:700}}>
          📋 방문 기록 <span style={{background:trip.color,color:'#fff',borderRadius:20,padding:'1px 8px',fontSize:10}}>{Math.max(visits.length,1)}회</span>
        </div>
        <button onClick={()=>setAdding(a=>!a)} style={{background:'#2c1500',color:'#f5c842',border:'none',borderRadius:20,padding:'4px 12px',fontSize:11,cursor:'pointer',fontFamily:'serif'}}>
          {adding?'취소':'+ 재방문 추가'}
        </button>
      </div>

      {adding && (
        <div style={{background:'#f5ead0',borderRadius:6,padding:12,marginBottom:10,display:'flex',flexDirection:'column',gap:8}}>
          <div style={{display:'flex',gap:5}}>
            {['당일','기간'].map((label,i)=>(
              <button key={label} onClick={()=>setRange(i===1)} style={{flex:1,background:rangeMode===(i===1)?'#2c1500':'transparent',color:rangeMode===(i===1)?'#f5c842':'#9a7a5a',border:`1.5px solid ${rangeMode===(i===1)?'#2c1500':'#dbc9aa'}`,borderRadius:4,padding:'5px',fontSize:12,cursor:'pointer',fontFamily:'serif'}}>{label}</button>
            ))}
          </div>
          {rangeMode
            ? <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} style={{flex:1,padding:'7px 8px',border:'1.5px solid #dbc9aa',borderRadius:4,fontFamily:'serif',fontSize:12,outline:'none'}}/>
                <span style={{color:'#9a7a5a',fontSize:12}}>~</span>
                <input type="date" value={newDateTo} onChange={e=>setNewTo(e.target.value)} min={newDate} style={{flex:1,padding:'7px 8px',border:'1.5px solid #dbc9aa',borderRadius:4,fontFamily:'serif',fontSize:12,outline:'none'}}/>
              </div>
            : <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} style={{padding:'7px 10px',border:'1.5px solid #dbc9aa',borderRadius:4,fontFamily:'serif',fontSize:13,outline:'none'}}/>
          }
          <textarea value={newMemo} onChange={e=>setNewMemo(e.target.value)} placeholder="이번 방문 메모 (선택)" rows={2}
            style={{padding:'7px 10px',border:'1.5px solid #dbc9aa',borderRadius:4,fontFamily:'serif',fontSize:13,outline:'none',resize:'vertical',lineHeight:1.65}}/>
          <button onClick={addVisit} disabled={!newDate||(rangeMode&&!newDateTo)}
            style={{background:'#2c1500',color:'#f5c842',border:'none',borderRadius:4,padding:'8px',fontSize:13,cursor:'pointer',fontFamily:'serif',fontWeight:700,opacity:(!newDate||(rangeMode&&!newDateTo))?0.4:1}}>
            🎫 기록 추가
          </button>
        </div>
      )}

      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {visits.map((v,i)=>(
          <div key={v.id} style={{display:'flex',gap:10,alignItems:'flex-start'}}>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',flexShrink:0}}>
              <div style={{width:10,height:10,borderRadius:'50%',background:i===0?trip.color:'#c9b89a',border:'2px solid #fff',boxShadow:`0 0 0 1.5px ${i===0?trip.color:'#c9b89a'}`,marginTop:4}}/>
              {i<visits.length-1&&<div style={{width:2,flex:1,minHeight:20,background:'#e8d5b7',marginTop:3}}/>}
            </div>
            <div style={{flex:1,background:i===0?'#fff9ee':'#fffcf2',border:`1px solid ${i===0?'#e8d5b7':'#f0e8d8'}`,borderRadius:5,padding:'8px 10px',marginBottom:4}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:12,fontWeight:700,color:i===0?trip.color:'#9a7a5a'}}>{formatVisitDate(v)}</span>
                {i===0&&<span style={{fontSize:9,background:trip.color,color:'#fff',borderRadius:20,padding:'1px 7px'}}>최근</span>}
                <div style={{marginLeft:'auto',display:'flex',gap:4}}>
                  <button onClick={()=>{setEditId(editId===v.id?null:v.id);setEditMemo(v.memo||'')}} style={{background:'none',border:'none',cursor:'pointer',fontSize:11,color:'#9a7a5a',padding:'1px 4px'}}>✏️</button>
                  {visits.length>1&&<button onClick={()=>delVisit(v.id)} style={{background:'none',border:'none',cursor:'pointer',fontSize:11,color:'#c0392b',padding:'1px 4px'}}>🗑</button>}
                </div>
              </div>
              {editId===v.id
                ? <div style={{display:'flex',flexDirection:'column',gap:5,marginTop:6}}>
                    <textarea value={editMemo} onChange={e=>setEditMemo(e.target.value)} rows={2} style={{padding:'6px 8px',border:'1.5px solid #dbc9aa',borderRadius:4,fontFamily:'serif',fontSize:12,outline:'none',resize:'vertical',lineHeight:1.65}}/>
                    <div style={{display:'flex',gap:5}}>
                      <button onClick={()=>setEditId(null)} style={{flex:1,background:'transparent',border:'1px solid #dbc9aa',borderRadius:4,padding:'5px',cursor:'pointer',fontFamily:'serif',fontSize:11}}>취소</button>
                      <button onClick={()=>saveEdit(v.id)} style={{flex:2,background:'#2c1500',color:'#f5c842',border:'none',borderRadius:4,padding:'5px',cursor:'pointer',fontFamily:'serif',fontSize:11,fontWeight:700}}>저장</button>
                    </div>
                  </div>
                : v.memo&&<div style={{fontSize:12,color:'#4a2800',lineHeight:1.7,whiteSpace:'pre-line',marginTop:4}}>{v.memo}</div>
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── 스탬프 카드 ───────────────────────────────────── */
function StampCard({trip, onDetail, onEdit, delay}) {
  const [h,setH] = useState(false)
  const lv = [...(trip.visits||[])].sort((a,b)=>(b.dateTo||b.date||'').localeCompare(a.dateTo||a.date||''))[0]
  return (
    <div style={{position:'relative',animation:`inkDrop 0.4s ${delay}s both`}}>
      <div onClick={onDetail} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
        style={{background:trip.color,color:'#fff',borderRadius:6,overflow:'hidden',cursor:'pointer',transform:h?'rotate(-1.5deg) scale(1.04)':'',boxShadow:h?'6px 8px 20px rgba(0,0,0,0.28)':'2px 4px 12px rgba(0,0,0,0.16)',transition:'transform 0.18s,box-shadow 0.18s'}}>
        <div style={{height:8,background:`repeating-linear-gradient(90deg,${trip.color} 0,${trip.color} 5px,rgba(255,255,255,0.3) 5px,rgba(255,255,255,0.3) 10px)`}}/>
        <div style={{padding:'14px 14px 12px',textAlign:'center'}}>
          <div style={{fontSize:34,lineHeight:1,marginBottom:6}}>{trip.emoji}</div>
          <div style={{fontSize:13,fontWeight:700,lineHeight:1.25}}>{trip.name}</div>
          {trip.location&&<div style={{fontSize:9,opacity:0.75,marginTop:2}}>{trip.location.split(',').slice(0,2).join(', ')}</div>}
          <div style={{marginTop:8,display:'flex',gap:5,justifyContent:'center',alignItems:'center',flexWrap:'wrap'}}>
            <div style={{display:'inline-block',border:'1px solid rgba(255,255,255,0.45)',borderRadius:20,padding:'2px 10px',fontSize:9,opacity:0.9}}>{formatVisitDate(lv)||trip.date}</div>
            {(trip.visits?.length||0)>=2&&<div style={{background:'rgba(255,255,255,0.25)',borderRadius:20,padding:'2px 8px',fontSize:9,fontWeight:700}}>{trip.visits.length}회 방문</div>}
          </div>
        </div>
        <div style={{height:8,background:`repeating-linear-gradient(90deg,${trip.color} 0,${trip.color} 5px,rgba(255,255,255,0.3) 5px,rgba(255,255,255,0.3) 10px)`}}/>
      </div>
      <button onClick={e=>{e.stopPropagation();onEdit()}} style={{position:'absolute',top:14,right:10,background:'rgba(255,255,255,0.22)',border:'1px solid rgba(255,255,255,0.45)',borderRadius:20,padding:'2px 8px',fontSize:10,cursor:'pointer',color:'#fff'}}>✏️</button>
    </div>
  )
}

/* ─── 여행 추가/수정 모달 ───────────────────────────── */
function TripModal({onClose, onSave, initialTrip}) {
  const isEdit = !!initialTrip
  const [form, setForm]   = useState(initialTrip
    ? {name:initialTrip.name,location:initialTrip.location||'',lat:initialTrip.lat,lng:initialTrip.lng,emoji:initialTrip.emoji,color:initialTrip.color}
    : {name:'',location:'',lat:37.5665,lng:126.9780,emoji:'🏖️',color:COLORS[0]})
  const [firstDate, setFD]   = useState('')
  const [firstDateTo, setFT] = useState('')
  const [firstMemo, setFM]   = useState('')
  const [rangeMode, setRM]   = useState(false)
  const [saved, setSaved]    = useState(false)
  const f = (k,v) => setForm(p=>({...p,[k]:v}))

  const save = async () => {
    if (!form.name) return
    if (!isEdit && !firstDate) return
    if (isEdit && rangeMode && !firstDateTo) return
    const trip = {...form, id:isEdit?initialTrip.id:Date.now(),
      visits:isEdit?initialTrip.visits:[{id:Date.now(),date:firstDate,...(rangeMode&&firstDateTo?{dateTo:firstDateTo}:{}),memo:firstMemo}]}
    await onSave(trip)
    setSaved(true); setTimeout(onClose, 1200)
  }
  const canSave = form.name && (isEdit || (firstDate && (!rangeMode||firstDateTo)))

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(20,8,0,0.6)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'#fffcf2',width:'100%',maxWidth:540,borderRadius:'12px 12px 0 0',padding:24,maxHeight:'90vh',overflowY:'auto',animation:'slideUp 0.3s ease both'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div style={{fontFamily:'Georgia,serif',fontSize:18,fontWeight:700,color:'#2c1500'}}>{isEdit?'여행 수정 ✏️':'새 여행 기록 ✍️'}</div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#9a7a5a'}}>✕</button>
        </div>
        {saved&&<div style={{background:isEdit?'#1a3a5c':'#2d5a16',color:'#fff',padding:12,borderRadius:6,textAlign:'center',marginBottom:16,fontSize:13}}>{isEdit?'✅ 수정 저장 완료!':'🎫 스탬프가 찍혔어요! 💛'}</div>}
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <Field label="여행 이름 *"><input style={inp} value={form.name} placeholder="예: 창경궁 봄나들이" onChange={e=>f('name',e.target.value)}/></Field>
          <Field label="장소 검색">
            <PlaceSearch value={form.location} onSelect={({location,lat,lng})=>{f('location',location);f('lat',lat);f('lng',lng)}}/>
          </Field>
          {!isEdit&&(
            <Field label="방문 날짜 *">
              <div style={{display:'flex',gap:5,marginBottom:7}}>
                {['당일','기간'].map((label,i)=>(
                  <button key={label} onClick={()=>setRM(i===1)} style={{flex:1,background:rangeMode===(i===1)?'#2c1500':'transparent',color:rangeMode===(i===1)?'#f5c842':'#9a7a5a',border:`1.5px solid ${rangeMode===(i===1)?'#2c1500':'#dbc9aa'}`,borderRadius:4,padding:'6px',fontSize:12,cursor:'pointer',fontFamily:'serif'}}>{label}</button>
                ))}
              </div>
              {rangeMode
                ? <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <input style={{...inp,flex:1}} type="date" value={firstDate} onChange={e=>setFD(e.target.value)}/>
                    <span style={{color:'#9a7a5a',fontSize:13}}>~</span>
                    <input style={{...inp,flex:1}} type="date" value={firstDateTo} onChange={e=>setFT(e.target.value)} min={firstDate}/>
                  </div>
                : <input style={inp} type="date" value={firstDate} onChange={e=>setFD(e.target.value)}/>
              }
            </Field>
          )}
          {!isEdit&&(
            <Field label="방문 메모">
              <textarea style={{...inp,resize:'vertical',lineHeight:1.75}} rows={2} value={firstMemo} placeholder="이든이와 함께한 기억..." onChange={e=>setFM(e.target.value)}/>
            </Field>
          )}
          <Field label="이모지">
            <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
              {EMOJIS.map(e=><button key={e} onClick={()=>f('emoji',e)} style={{background:form.emoji===e?'#2c1500':'transparent',border:`1.5px solid ${form.emoji===e?'#2c1500':'#dbc9aa'}`,borderRadius:5,padding:'4px 7px',fontSize:17,cursor:'pointer'}}>{e}</button>)}
            </div>
          </Field>
          <Field label="스탬프 색상">
            <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
              {COLORS.map(c=><button key={c} onClick={()=>f('color',c)} style={{width:28,height:28,borderRadius:'50%',background:c,border:'none',cursor:'pointer',outline:form.color===c?'3px solid #2c1500':'2px solid transparent',outlineOffset:2}}/>)}
            </div>
          </Field>
          {form.name&&(
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:10,color:'#9a7a5a',marginBottom:6}}>미리보기</div>
              <div style={{display:'inline-block',background:form.color,color:'#fff',borderRadius:5,overflow:'hidden',width:120}}>
                <div style={{height:6,background:`repeating-linear-gradient(90deg,${form.color} 0,${form.color} 4px,rgba(255,255,255,0.3) 4px,rgba(255,255,255,0.3) 8px)`}}/>
                <div style={{padding:'8px 10px',textAlign:'center'}}>
                  <div style={{fontSize:24}}>{form.emoji}</div>
                  <div style={{fontSize:11,fontWeight:700,marginTop:3}}>{form.name}</div>
                  <div style={{fontSize:9,opacity:0.8,marginTop:2}}>{isEdit?latestDate(initialTrip):firstDate||'날짜'}</div>
                </div>
                <div style={{height:6,background:`repeating-linear-gradient(90deg,${form.color} 0,${form.color} 4px,rgba(255,255,255,0.3) 4px,rgba(255,255,255,0.3) 8px)`}}/>
              </div>
            </div>
          )}
          <button onClick={save} disabled={!canSave} style={{padding:'13px',background:'#2c1500',color:'#f5c842',border:'none',borderRadius:5,fontSize:15,fontFamily:'serif',fontWeight:700,cursor:'pointer',opacity:!canSave?0.45:1}}>
            {isEdit?'💾 수정 저장':'🎫 스탬프 찍기'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── 상세 모달 ─────────────────────────────────────── */
function DetailModal({trip, onClose, onDelete, onEdit, onUpdate}) {
  const [confirm, setConfirm] = useState(false)
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(20,8,0,0.6)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'#fffcf2',width:'100%',maxWidth:540,borderRadius:'12px 12px 0 0',padding:24,maxHeight:'80vh',overflowY:'auto',animation:'slideUp 0.3s ease both'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <button onClick={onEdit} style={{background:'#f0e6d0',border:'1px solid #dbc9aa',borderRadius:5,padding:'5px 14px',fontSize:12,cursor:'pointer',fontFamily:'serif',color:'#4a2800'}}>✏️ 수정</button>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#9a7a5a'}}>✕</button>
        </div>
        <div style={{background:trip.color,color:'#fff',borderRadius:6,overflow:'hidden',textAlign:'center',marginBottom:16}}>
          <div style={{height:12,background:`repeating-linear-gradient(90deg,${trip.color} 0,${trip.color} 6px,rgba(255,255,255,0.28) 6px,rgba(255,255,255,0.28) 12px)`}}/>
          <div style={{padding:'22px 20px'}}>
            <div style={{fontSize:58,lineHeight:1}}>{trip.emoji}</div>
            <div style={{fontFamily:'Georgia,serif',fontSize:22,fontWeight:700,marginTop:8}}>{trip.name}</div>
            {trip.location&&<div style={{fontSize:12,opacity:0.8,marginTop:4}}>📍 {trip.location.split(',').slice(0,3).join(', ')}</div>}
            <div style={{marginTop:10,display:'inline-block',border:'1.5px solid rgba(255,255,255,0.5)',borderRadius:20,padding:'3px 16px',fontSize:12}}>📅 {latestDate(trip)}</div>
          </div>
          <div style={{height:12,background:`repeating-linear-gradient(90deg,${trip.color} 0,${trip.color} 6px,rgba(255,255,255,0.28) 6px,rgba(255,255,255,0.28) 12px)`}}/>
        </div>
        <VisitTimeline trip={trip} onUpdate={onUpdate}/>
        {!confirm
          ? <button onClick={()=>setConfirm(true)} style={{width:'100%',background:'transparent',color:'#c0392b',border:'1.5px solid #c0392b',borderRadius:4,padding:10,cursor:'pointer',fontFamily:'serif',fontSize:13}}>🗑️ 이 여행 삭제</button>
          : <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setConfirm(false)} style={{flex:1,background:'transparent',border:'1.5px solid #dbc9aa',borderRadius:4,padding:10,cursor:'pointer',fontFamily:'serif'}}>취소</button>
              <button onClick={onDelete} style={{flex:1,background:'#c0392b',color:'#fff',border:'none',borderRadius:4,padding:10,cursor:'pointer',fontFamily:'serif'}}>삭제 확인</button>
            </div>
        }
      </div>
    </div>
  )
}

/* ─── 바로가기 관리 모달 ────────────────────────────── */
function ShortcutsModal({shortcuts, defaultScId, onClose, onSave}) {
  const [list, setList]         = useState(shortcuts)
  const [defaultId, setDefaultId] = useState(defaultScId)
  const [adding, setAdding] = useState(false)
  const [newLabel, setNL]   = useState('')
  const [searchQ, setSQ]    = useState('')
  const [searching, setSR]  = useState(false)
  const [found, setFound]   = useState(null)
  const [searchErr, setSE]  = useState('')

  const doSearch = async () => {
    if (!searchQ.trim()) return
    setSR(true); setFound(null); setSE('')
    const r = await geocode(searchQ)
    setSR(false)
    if (r.error) { setSE('장소를 찾지 못했어요.') }
    else { setFound(r); setNL(r.name) }
  }
  const addShortcut = () => {
    if (!found||!newLabel.trim()) return
    setList(l=>[...l,{id:Date.now().toString(),label:newLabel.trim(),lat:found.lat,lng:found.lng,zoom:10}])
    setAdding(false); setNL(''); setSQ(''); setFound(null)
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(20,8,0,0.6)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'#fffcf2',width:'100%',maxWidth:480,borderRadius:10,padding:24,maxHeight:'80vh',overflowY:'auto',boxShadow:'0 8px 32px rgba(0,0,0,0.3)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
          <div style={{fontFamily:'Georgia,serif',fontSize:16,fontWeight:700,color:'#2c1500'}}>🗂 바로가기 관리</div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#9a7a5a'}}>✕</button>
        </div>
        <div style={{marginBottom:16}}>
          {list.map((sc,i)=>(
            <div key={sc.id} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 10px',background: defaultId===sc.id?'#f0e8c8':'#f5ead0',borderRadius:5,marginBottom:5,border: defaultId===sc.id?'1.5px solid #c9a840':'1.5px solid transparent'}}>
              <span style={{fontSize:13,flex:1,color:'#2c1500'}}>{sc.label}</span>
              {defaultId===sc.id
                ? <span style={{fontSize:10,background:'#f5c842',color:'#2c1500',borderRadius:20,padding:'2px 8px',fontWeight:700}}>⭐ 기본값</span>
                : <button onClick={()=>setDefaultId(sc.id)} style={{background:'transparent',border:'1px solid #c9a840',borderRadius:20,padding:'2px 8px',fontSize:10,cursor:'pointer',color:'#8a7030'}}>⭐ 기본으로</button>
              }
              <button onClick={()=>{setList(l=>l.filter((_,j)=>j!==i)); if(defaultId===sc.id) setDefaultId(list[0]?.id||'')}} style={{background:'transparent',border:'1px solid #e8a090',borderRadius:4,padding:'2px 8px',fontSize:11,cursor:'pointer',color:'#c0392b'}}>삭제</button>
            </div>
          ))}
        </div>
        <div style={{borderTop:'1px solid #e8d5b7',paddingTop:14}}>
          {!adding
            ? <button onClick={()=>setAdding(true)} style={{width:'100%',background:'transparent',border:'2px dashed #dbc9aa',borderRadius:5,padding:'10px',fontSize:13,cursor:'pointer',fontFamily:'serif',color:'#9a7a5a'}}>+ 새 바로가기 추가</button>
            : <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <div style={{display:'flex',gap:6}}>
                  <input value={searchQ} onChange={e=>setSQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doSearch()}
                    placeholder="장소명 (예: 경복궁, 오사카)" style={{flex:1,padding:'8px 12px',border:'1.5px solid #dbc9aa',borderRadius:4,fontSize:13,fontFamily:'serif',outline:'none'}}/>
                  <button onClick={doSearch} disabled={searching} style={{background:'#2c1500',color:'#f5c842',border:'none',borderRadius:4,padding:'8px 14px',fontSize:12,cursor:'pointer',fontFamily:'serif'}}>{searching?'⏳':'검색'}</button>
                </div>
                {searchErr&&<div style={{fontSize:12,color:'#c0392b'}}>{searchErr}</div>}
                {found&&(
                  <>
                    <div style={{background:'#edf7e0',borderRadius:4,padding:'8px 12px',fontSize:12,color:'#2c1500'}}>✓ {found.name} ({found.lat?.toFixed(3)}, {found.lng?.toFixed(3)})</div>
                    <input value={newLabel} onChange={e=>setNL(e.target.value)} placeholder="버튼에 표시할 이름" style={{padding:'8px 12px',border:'1.5px solid #dbc9aa',borderRadius:4,fontSize:13,fontFamily:'serif',outline:'none'}}/>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={()=>setAdding(false)} style={{flex:1,background:'transparent',border:'1px solid #dbc9aa',borderRadius:4,padding:8,cursor:'pointer',fontFamily:'serif'}}>취소</button>
                      <button onClick={addShortcut} style={{flex:2,background:'#2c1500',color:'#f5c842',border:'none',borderRadius:4,padding:8,cursor:'pointer',fontFamily:'serif',fontWeight:700}}>추가</button>
                    </div>
                  </>
                )}
                {!found&&!searchErr&&!searching&&<button onClick={()=>setAdding(false)} style={{background:'transparent',border:'1px solid #dbc9aa',borderRadius:4,padding:8,cursor:'pointer',fontFamily:'serif',color:'#9a7a5a',fontSize:12}}>취소</button>}
              </div>
          }
        </div>
        <button onClick={()=>onSave(list, defaultId)} style={{marginTop:18,width:'100%',background:'#2c1500',color:'#f5c842',border:'none',borderRadius:5,padding:12,fontSize:14,fontFamily:'serif',fontWeight:700,cursor:'pointer'}}>💾 저장</button>
      </div>
    </div>
  )
}

/* ─── 지도 뷰 (Leaflet, 멀티 핀) ───────────────────── */
function MapView({trips, shortcuts, defaultScId, onTripDetail, onEditShortcuts}) {
  const mapRef      = useRef(null)
  const containerRef= useRef(null)
  const markersRef  = useRef({})
  const leafletReady= useLeaflet()
  // 활성화된 여행지 id set (토글)
  const [active, setActive] = useState(() => new Set(trips.map(t=>t.id)))

  // 지도 초기화
  useEffect(() => {
    if (!leafletReady || !containerRef.current || mapRef.current) return
    try {
      const LF = window.L
      const initSc = shortcuts.find(s=>s.id===defaultScId) || shortcuts[0]
      const map = LF.map(containerRef.current, {
        center: initSc ? [initSc.lat, initSc.lng] : [36.5, 127.8],
        zoom:   initSc ? initSc.zoom : 7,
        zoomControl: false
      })
      LF.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {attribution:'© OpenStreetMap', maxZoom:19}).addTo(map)
      LF.control.zoom({position:'bottomright'}).addTo(map)
      mapRef.current = map
    } catch(e) { console.warn('지도 초기화 오류:', e) }
  }, [leafletReady])

  // 핀 동기화 (trips 또는 active 변경 시)
  useEffect(() => {
    if (!mapRef.current || !leafletReady) return
    try {
      const LF = window.L
      const map = mapRef.current
      // 기존 마커 모두 제거
      Object.values(markersRef.current).forEach(m => map.removeLayer(m))
      markersRef.current = {}
      // active 인 것만 핀 추가
      trips.forEach(trip => {
        if (!active.has(trip.id)) return
        const icon = LF.divIcon({
          html:`<div style="background:${trip.color};color:#fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);width:34px;height:34px;display:flex;align-items:center;justify-content:center;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer"><span style="transform:rotate(45deg);font-size:16px">${trip.emoji}</span></div>`,
          iconSize:[34,34], iconAnchor:[17,34], popupAnchor:[0,-36], className:''
        })
        const marker = LF.marker([trip.lat, trip.lng], {icon})
          .addTo(map)
          .bindPopup(`
            <div style="font-family:Georgia,serif;min-width:150px;padding:2px 0">
              <div style="font-weight:700;font-size:14px;color:#2c1500;margin-bottom:3px">${trip.name}</div>
              <div style="font-size:11px;color:#9a7a5a;margin-bottom:8px">📅 ${latestDate(trip)}${trip.location?`<br>📍 ${trip.location.split(',').slice(0,2).join(', ')}`:''}
              </div>
              <button onclick="window.__tripDetail__('${trip.id}')"
                style="background:#2c1500;color:#f5c842;border:none;border-radius:4px;padding:5px 12px;font-size:12px;cursor:pointer;width:100%;font-family:serif">
                자세히 보기 →
              </button>
            </div>`, {maxWidth:230})
        markersRef.current[trip.id] = marker
      })
    } catch(e) { console.warn('마커 오류:', e) }
  }, [trips, active, leafletReady])

  // 팝업 버튼 → React 연결
  useEffect(() => {
    window.__tripDetail__ = id => {
      const t = trips.find(t=>String(t.id)===String(id))
      if (t) onTripDetail(t)
    }
    return () => { delete window.__tripDetail__ }
  }, [trips, onTripDetail])

  useEffect(() => () => {
    if (mapRef.current) { try { mapRef.current.remove() } catch {} mapRef.current = null }
  }, [])

  const flyTo = (lat, lng, zoom) => {
    if (mapRef.current) try { mapRef.current.flyTo([lat,lng], zoom, {duration:1}) } catch {}
  }

  const toggleTrip = (id) => {
    setActive(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div>
      {/* 바로가기 바 */}
      <div style={{display:'flex',gap:6,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:11,color:'#9a7a5a',whiteSpace:'nowrap'}}>바로가기:</span>
        {shortcuts.map(sc=>(
          <button key={sc.id} onClick={()=>flyTo(sc.lat,sc.lng,sc.zoom)}
            style={{background:'#2c1500',color:'#f5c842',border:'none',borderRadius:20,padding:'4px 12px',fontSize:11,cursor:'pointer',fontFamily:'serif',whiteSpace:'nowrap'}}>
            {sc.label}
          </button>
        ))}
        <button onClick={onEditShortcuts}
          style={{marginLeft:'auto',background:'transparent',border:'1.5px solid #dbc9aa',borderRadius:20,padding:'4px 12px',fontSize:11,cursor:'pointer',fontFamily:'serif',color:'#4a2800',whiteSpace:'nowrap'}}>
          ⚙️ 편집
        </button>
      </div>

      {/* 지도 */}
      {!leafletReady
        ? <div style={{height:440,display:'flex',alignItems:'center',justifyContent:'center',background:'#e8f4fd',borderRadius:8,color:'#5a7a9a',fontSize:14,gap:8}}>
            <span style={{fontSize:28}}>🌍</span> 지도를 불러오는 중...
          </div>
        : <div ref={containerRef} style={{height:440,borderRadius:8,overflow:'hidden',boxShadow:'1px 2px 12px rgba(0,0,0,0.14)'}}/>
      }

      {/* 내 여행지 토글 */}
      {trips.length > 0 && (
        <div style={{marginTop:12}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:7}}>
            <span style={{fontSize:11,color:'#9a7a5a'}}>📍 내 여행지</span>
            <button onClick={()=>setActive(new Set(trips.map(t=>t.id)))}
              style={{fontSize:10,background:'transparent',border:'1px solid #dbc9aa',borderRadius:20,padding:'2px 8px',cursor:'pointer',color:'#4a2800',fontFamily:'serif'}}>
              전체 ON
            </button>
            <button onClick={()=>setActive(new Set())}
              style={{fontSize:10,background:'transparent',border:'1px solid #dbc9aa',borderRadius:20,padding:'2px 8px',cursor:'pointer',color:'#4a2800',fontFamily:'serif'}}>
              전체 OFF
            </button>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {trips.map(t=>(
              <button key={t.id} onClick={()=>toggleTrip(t.id)}
                style={{
                  background:active.has(t.id)?t.color:'#e8d5b7',
                  color:active.has(t.id)?'#fff':'#9a7a5a',
                  border:`1.5px solid ${active.has(t.id)?t.color:'#dbc9aa'}`,
                  borderRadius:20,padding:'4px 12px',fontSize:11,cursor:'pointer',fontFamily:'serif',whiteSpace:'nowrap',
                  opacity:active.has(t.id)?1:0.6,transition:'all 0.15s'
                }}>
                {t.emoji} {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


/* ─── 루트 에러 바운더리 ────────────────────────────── */
class RootErrorBoundary extends Component {
  constructor(props) { super(props); this.state={hasError:false,error:null} }
  static getDerivedStateFromError(e) { return {hasError:true,error:e} }
  render() {
    if (this.state.hasError) return (
      <div style={{padding:40,textAlign:'center',fontFamily:'Georgia,serif',color:'#4a2800'}}>
        <div style={{fontSize:48,marginBottom:16}}>⚠️</div>
        <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>앱 오류가 발생했어요</div>
        <div style={{fontSize:12,color:'#9a7a5a',marginBottom:24}}>{String(this.state.error)}</div>
        <button onClick={()=>window.location.reload()} style={{background:'#2c1500',color:'#f5c842',border:'none',borderRadius:5,padding:'10px 24px',fontSize:14,cursor:'pointer',fontFamily:'serif'}}>새로고침</button>
      </div>
    )
    return this.props.children
  }
}

/* ─── 메인 앱 ───────────────────────────────────────── */
function App() {
  // localStorage에서 동기적으로 초기화 (새로고침해도 안 사라짐)
  const [trips, setTrips]         = useState(() => {
    try { const s=lsGet(STORAGE_KEY); return s?migrate(JSON.parse(s)):[] } catch { return [] }
  })
  const [shortcuts, setShortcuts] = useState(() => {
    try { const s=lsGet(SHORTCUTS_KEY); return s?JSON.parse(s):DEFAULT_SHORTCUTS } catch { return DEFAULT_SHORTCUTS }
  })
  const [defaultScId, setDefaultScId] = useState(() => lsGet(DEFAULT_SC_KEY) || 'korea')
  const [tab,   setTab]   = useState('stamps')
  const [modal, setModal] = useState(null)
  const [sortBy, setSortBy] = useState('date_desc')

  // Firebase 백그라운드 동기화
  useEffect(() => {
    import('./firebase.js').then(({storageGet})=>{
      storageGet(STORAGE_KEY).then(r=>{ if(r) { const parsed=migrate(JSON.parse(r)); setTrips(parsed); lsSet(STORAGE_KEY,JSON.stringify(parsed)) } }).catch(()=>{})
      storageGet(SHORTCUTS_KEY).then(s=>{ if(s) { const parsed=JSON.parse(s); setShortcuts(parsed); lsSet(SHORTCUTS_KEY,JSON.stringify(parsed)) } }).catch(()=>{})
    })
  }, [])

  const persist = next => { saveTripsLocal(next); setTrips(next) }
  const saveTrip = trip => { const ex=trips.some(t=>t.id===trip.id); persist(ex?trips.map(t=>t.id===trip.id?trip:t):[...trips,trip]) }
  const delTrip  = id  => persist(trips.filter(t=>t.id!==id))
  const saveSC   = (next, newDefaultId) => { saveShortcutsLocal(next); setShortcuts(next); if(newDefaultId!==undefined){lsSet(DEFAULT_SC_KEY,newDefaultId);setDefaultScId(newDefaultId)} setModal(null) }

  const sorted = [...trips].sort((a,b)=>{
    if (sortBy==='date_desc') return latestDate(b).localeCompare(latestDate(a))
    if (sortBy==='date_asc')  return latestDate(a).localeCompare(latestDate(b))
    return (a.name||'').localeCompare(b.name||'','ko')
  })

  return (
    <div style={{minHeight:'100vh',background:'#f4e9d8',fontFamily:'Georgia,serif'}}>
      <style>{`
        * { box-sizing:border-box }
        @keyframes inkDrop { 0%{transform:scale(1.4) rotate(-3deg);opacity:0;filter:blur(4px)} 60%{transform:scale(0.93) rotate(1deg);opacity:1;filter:blur(0)} 100%{transform:scale(1);opacity:1} }
        @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
        ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-track{background:#e8d5b7} ::-webkit-scrollbar-thumb{background:#b8956a;border-radius:3px}
        .leaflet-popup-content-wrapper{border-radius:8px!important} .leaflet-popup-content{margin:12px 14px!important}
      `}</style>

      <div style={{background:'#2c1500',padding:'16px 20px',display:'flex',alignItems:'center',gap:14}}>
        <div style={{fontSize:26}}>✈️</div>
        <div style={{flex:1}}>
          <div style={{color:'#f5c842',fontFamily:'Georgia,serif',fontSize:18,fontWeight:700}}>이든이와의 여행 일지</div>
          <div style={{color:'#a07850',fontSize:11,marginTop:1}}>소중한 순간들을 스탬프로 기록합니다</div>
        </div>
        <div style={{background:'#f5c842',color:'#2c1500',borderRadius:20,padding:'4px 12px',fontSize:12,fontWeight:700}}>{trips.length}곳 ✓</div>
      </div>

      <div style={{background:'#fffcf2',borderBottom:'1px solid #dbc9aa',display:'flex',paddingLeft:8}}>
        {[{id:'stamps',label:'🎫 스탬프북'},{id:'map',label:'🗺️ 지도'}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:'none',border:'none',borderBottom:`2.5px solid ${tab===t.id?'#2c1500':'transparent'}`,padding:'10px 20px',fontFamily:'serif',fontSize:13,cursor:'pointer',color:tab===t.id?'#2c1500':'#9a7a5a',fontWeight:tab===t.id?700:400,transition:'all 0.15s'}}>{t.label}</button>
        ))}
      </div>

      <div style={{padding:18,maxWidth:800,margin:'0 auto'}}>
        {tab==='stamps' && (
          <>
            {trips.length===0
              ? <div style={{textAlign:'center',padding:'56px 20px',color:'#9a7a5a'}}>
                  <div style={{fontSize:72,marginBottom:16}}>📒</div>
                  <div style={{fontSize:17,fontWeight:700,color:'#4a2800',marginBottom:8}}>아직 여행 기록이 없어요</div>
                  <div style={{fontSize:13,marginBottom:28,lineHeight:1.7}}>이든이와 함께 다녀온 곳을<br/>스탬프로 찍어 기록해보세요!</div>
                  <button onClick={()=>setModal({type:'add'})} style={{background:'#2c1500',color:'#f5c842',border:'none',borderRadius:5,padding:'12px 28px',fontSize:15,fontFamily:'serif',fontWeight:700,cursor:'pointer'}}>+ 첫 여행 기록하기</button>
                </div>
              : <>
                  <div style={{display:'flex',gap:8,marginBottom:12}}>
                    {[{label:'총 여행지',value:`${trips.length}곳`},{label:'올해 여행',value:`${trips.filter(t=>latestDate(t).startsWith(new Date().getFullYear().toString())).length}회`}].map(s=>(
                      <div key={s.label} style={{flex:1,background:'#fffcf2',boxShadow:'1px 2px 8px rgba(0,0,0,0.08)',borderRadius:4,padding:'10px 14px',textAlign:'center'}}>
                        <div style={{fontSize:18,fontWeight:700,color:'#2c1500'}}>{s.value}</div>
                        <div style={{fontSize:10,color:'#9a7a5a',marginTop:2}}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:'flex',gap:5,marginBottom:14,alignItems:'center'}}>
                    <span style={{fontSize:11,color:'#9a7a5a',marginRight:2}}>정렬:</span>
                    {[{key:'date_desc',label:'📅 최신순'},{key:'date_asc',label:'📅 오래된순'},{key:'name',label:'🔤 이름순'}].map(o=>(
                      <button key={o.key} onClick={()=>setSortBy(o.key)} style={{background:sortBy===o.key?'#2c1500':'transparent',color:sortBy===o.key?'#f5c842':'#9a7a5a',border:`1.5px solid ${sortBy===o.key?'#2c1500':'#dbc9aa'}`,borderRadius:20,padding:'3px 11px',fontSize:11,cursor:'pointer',fontFamily:'serif',transition:'all 0.15s'}}>{o.label}</button>
                    ))}
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                    {sorted.map((trip,i)=>(
                      <StampCard key={trip.id} trip={trip} delay={i*0.05}
                        onDetail={()=>setModal({type:'detail',trip})}
                        onEdit={()=>setModal({type:'edit',trip})}/>
                    ))}
                  </div>
                </>
            }
            <button onClick={()=>setModal({type:'add'})} style={{position:'fixed',bottom:28,right:22,width:56,height:56,borderRadius:'50%',background:'#2c1500',color:'#f5c842',border:'3px solid #f5c842',fontSize:28,cursor:'pointer',boxShadow:'0 4px 16px rgba(0,0,0,0.35)',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
          </>
        )}

        {tab==='map' && (
          <MapView trips={trips} shortcuts={shortcuts} defaultScId={defaultScId}
            onTripDetail={trip=>setModal({type:'detail',trip})}
            onEditShortcuts={()=>setModal({type:'shortcuts'})}/>
        )}
      </div>

      {(modal?.type==='add'||modal?.type==='edit') && (
        <TripModal initialTrip={modal.type==='edit'?modal.trip:null} onClose={()=>setModal(null)} onSave={async t=>{saveTrip(t)}}/>
      )}
      {modal?.type==='detail' && (
        <DetailModal trip={modal.trip} onClose={()=>setModal(null)}
          onDelete={()=>{delTrip(modal.trip.id);setModal(null)}}
          onEdit={()=>setModal({type:'edit',trip:modal.trip})}
          onUpdate={t=>{saveTrip(t);setModal({type:'detail',trip:t})}}/>
      )}
      {modal?.type==='shortcuts' && (
        <ShortcutsModal shortcuts={shortcuts} defaultScId={defaultScId} onClose={()=>setModal(null)} onSave={saveSC}/>
      )}
    </div>
  )
}

export default function AppWithBoundary() {
  return <RootErrorBoundary><App/></RootErrorBoundary>
}
