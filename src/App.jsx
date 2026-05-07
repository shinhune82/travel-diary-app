import { useState, useEffect, useRef, Component } from 'react'
import { storageSet } from './firebase.js'

/* ─── 상수 ──────────────────────────────────────────── */
const TRIPS_KEY  = 'eden_travel_journal_v4'
const SC_KEY     = 'eden_map_shortcuts_v1'
const CAT_KEY    = 'eden_categories_v1'
const DFLT_SC_KEY= 'eden_map_default_sc'

const DEFAULT_CATS = [
  { id:'c1', label:'산책',    emoji:'🚶', color:'#2d5a16' },
  { id:'c2', label:'놀이',    emoji:'🎡', color:'#4a1060' },
  { id:'c3', label:'맛집',    emoji:'🍜', color:'#7a3900' },
  { id:'c4', label:'바다/물', emoji:'🌊', color:'#1a3a5c' },
  { id:'c5', label:'역사/궁', emoji:'🏯', color:'#8B0000' },
  { id:'c6', label:'자연',    emoji:'🌸', color:'#0a4a3a' },
  { id:'c7', label:'여행',    emoji:'✈️', color:'#5c2d00' },
  { id:'c8', label:'기타',    emoji:'📍', color:'#5a5a5a' },
]
const DEFAULT_SC = [
  { id:'world', label:'🌍 세계', lat:30,   lng:20,    zoom:2 },
  { id:'korea', label:'🇰🇷 한국', lat:36.5, lng:127.8, zoom:7 },
  { id:'japan', label:'🇯🇵 일본', lat:35.7, lng:139.7, zoom:8 },
]
const EMOJI_LIST = ['🚶','🎡','🍜','🌊','🏯','🌸','✈️','📍','🏖️','🏔️','🎪','⛩️','🌋','🏝️','🎠','🦁','🏄','🎑','🎭','🎨','🍣','🗿','🏟️','🌺','🎋']

/* ─── localStorage / Firebase ───────────────────────── */
function lsGet(k)   { try { return localStorage.getItem(k) } catch { return null } }
function lsSet(k,v) { try { localStorage.setItem(k,v) } catch {} }
function persist(key, data) {
  lsSet(key, JSON.stringify(data))
  storageSet(key, JSON.stringify(data)).catch(()=>{})
}

/* ─── 날짜 헬퍼 ─────────────────────────────────────── */
function latestDate(trip) {
  const vs = trip.visits
  if (!vs?.length) return trip.date||''
  const s = [...vs].sort((a,b)=>(b.dateTo||b.date||'').localeCompare(a.dateTo||a.date||''))
  return s[0].dateTo || s[0].date || ''
}
function fmtVisit(v) {
  if (!v) return ''
  return v.dateTo && v.dateTo!==v.date ? `${v.date} ~ ${v.dateTo}` : v.date
}

/* ─── 마이그레이션 ──────────────────────────────────── */
function migrateTrips(trips, cats) {
  const miscId = cats.find(c=>c.label==='기타')?.id || cats[0]?.id || 'c8'
  return trips.map(t => {
    if (t.categoryId) return t  // 이미 새 형식
    const visits = t.visits?.length
      ? t.visits
      : [{ id: Date.now()+Math.random(), date:t.date||'', memo:t.description||'' }]
    return {
      id: t.id,
      categoryId: miscId,
      location: t.location||'',
      lat: t.lat, lng: t.lng,
      visits,
    }
  })
}

/* ─── Geocoding ─────────────────────────────────────── */
async function geocode(q) {
  try {
    const isKo = /[가-힣]/.test(q)
    const p = new URLSearchParams({q,format:'json',limit:'1',addressdetails:'1'})
    const res = await fetch('https://nominatim.openstreetmap.org/search?'+p,
      {headers:{'Accept-Language':isKo?'ko,en':'en'}})
    const data = await res.json()
    if (!data.length) return {error:'not_found'}
    const r=data[0], parts=r.display_name.split(',')
    return {lat:parseFloat(r.lat),lng:parseFloat(r.lon),name:parts[0].trim(),address:parts.slice(1,4).join(',').trim()}
  } catch { return {error:'network_error'} }
}

/* ─── Leaflet ───────────────────────────────────────── */
function useLeaflet() {
  const [ready, setReady] = useState(!!window.L)
  useEffect(() => {
    if (window.L) { setReady(true); return }
    if (!document.getElementById('lf-css')) {
      const lk=document.createElement('link')
      lk.id='lf-css'; lk.rel='stylesheet'
      lk.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
      document.head.appendChild(lk)
    }
    const sc=document.createElement('script')
    sc.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
    sc.onload=()=>setReady(true)
    document.head.appendChild(sc)
  }, [])
  return ready
}

/* ─── 공통 스타일 ───────────────────────────────────── */
const inp = {width:'100%',padding:'9px 12px',border:'1.5px solid #dbc9aa',borderRadius:4,background:'#fffdf5',fontSize:14,fontFamily:'serif',color:'#2c1500',outline:'none',boxSizing:'border-box'}
function Field({label,children}) {
  return <div><div style={{fontSize:10,color:'#9a7a5a',marginBottom:5,letterSpacing:'0.06em',textTransform:'uppercase'}}>{label}</div>{children}</div>
}

/* ─── 장소 검색 ─────────────────────────────────────── */
function PlaceSearch({value, onSelect}) {
  const [q,setQ]       = useState(value||'')
  const [busy,setBusy] = useState(false)
  const [result,setR]  = useState(null)
  const [err,setErr]   = useState('')

  const search = async () => {
    if (!q.trim()) return
    setBusy(true); setR(null); setErr('')
    const r = await geocode(q)
    setBusy(false)
    if (r.error) setErr('장소를 찾지 못했어요.\n예) "창경궁 종로", "해운대 부산"')
    else { setR(r); onSelect({location:r.name+(r.address?`, ${r.address}`:''),lat:r.lat,lng:r.lng}) }
  }
  const clear = () => { setQ(''); setR(null); setErr(''); onSelect({location:'',lat:37.5665,lng:126.9780}) }

  return (
    <div>
      <div style={{display:'flex',gap:6}}>
        <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()}
          placeholder="예: 창경궁, 해운대, Tokyo Tower" style={{...inp,flex:1}}/>
        {result
          ? <button onClick={clear} style={{background:'#9a7a5a',color:'#fff',border:'none',borderRadius:4,padding:'9px 14px',fontSize:13,cursor:'pointer'}}>✕</button>
          : <button onClick={search} disabled={busy||!q.trim()} style={{background:'#2c1500',color:'#f5c842',border:'none',borderRadius:4,padding:'9px 14px',fontSize:13,cursor:'pointer',opacity:busy||!q.trim()?0.5:1}}>
              {busy?'⏳':'검색'}
            </button>
        }
      </div>
      {err && <div style={{marginTop:6,background:'#fff5f0',border:'1px solid #f5b8a0',borderRadius:4,padding:'8px 12px',fontSize:12,color:'#c0392b',whiteSpace:'pre-line'}}>{err}</div>}
      {result && (
        <div style={{marginTop:6,background:'#edf7e0',border:'1px solid #a8d880',borderRadius:4,padding:'8px 12px',fontSize:12,color:'#2c1500',display:'flex',gap:8}}>
          <span>📍</span>
          <div>
            <div style={{fontWeight:700}}>{result.name}</div>
            {result.address&&<div style={{color:'#5a7a3a'}}>{result.address}</div>}
            <div style={{color:'#9a7a5a',fontSize:11}}>{result.lat?.toFixed(4)}, {result.lng?.toFixed(4)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── 카테고리 관리 모달 ────────────────────────────── */
function CategoryModal({cats, onClose, onSave}) {
  const [list, setList]   = useState(cats.map(c=>({...c})))
  const [editing, setEd]  = useState(null) // {idx, label, emoji, color} | 'new'
  const [form, setForm]   = useState({label:'',emoji:'📍',color:'#5a5a5a'})

  const startEdit = (c, idx) => { setEd(idx); setForm({label:c.label,emoji:c.emoji,color:c.color}) }
  const startNew  = () => { setEd('new'); setForm({label:'',emoji:'📍',color:'#2d5a16'}) }

  const saveEdit = () => {
    if (!form.label.trim()) return
    if (editing==='new') {
      setList(l=>[...l,{id:'c'+Date.now(),label:form.label,emoji:form.emoji,color:form.color}])
    } else {
      setList(l=>l.map((c,i)=>i===editing?{...c,...form}:c))
    }
    setEd(null)
  }

  const del = idx => {
    if (list.length<=1) return
    setList(l=>l.filter((_,i)=>i!==idx))
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(20,8,0,0.6)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'#fffcf2',width:'100%',maxWidth:480,borderRadius:10,padding:24,maxHeight:'85vh',overflowY:'auto',boxShadow:'0 8px 32px rgba(0,0,0,0.3)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
          <div style={{fontFamily:'Georgia,serif',fontSize:16,fontWeight:700,color:'#2c1500'}}>🏷️ 카테고리 관리</div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#9a7a5a'}}>✕</button>
        </div>

        {/* 카테고리 목록 */}
        <div style={{marginBottom:14}}>
          {list.map((c,i)=>(
            <div key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'#f5ead0',borderRadius:6,marginBottom:6,border:`2px solid ${c.color}22`}}>
              <div style={{width:32,height:32,borderRadius:6,background:c.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>{c.emoji}</div>
              <span style={{flex:1,fontSize:13,color:'#2c1500',fontWeight:600}}>{c.label}</span>
              <button onClick={()=>startEdit(c,i)} style={{background:'transparent',border:'1px solid #dbc9aa',borderRadius:4,padding:'2px 8px',fontSize:11,cursor:'pointer',color:'#4a2800'}}>수정</button>
              {list.length>1&&<button onClick={()=>del(i)} style={{background:'transparent',border:'1px solid #e8a090',borderRadius:4,padding:'2px 8px',fontSize:11,cursor:'pointer',color:'#c0392b'}}>삭제</button>}
            </div>
          ))}
        </div>

        {/* 편집 폼 */}
        {editing!==null && (
          <div style={{background:'#e8f5e8',borderRadius:6,padding:14,marginBottom:14,border:'1.5px solid #a8d880'}}>
            <div style={{fontSize:12,color:'#2d5a16',fontWeight:700,marginBottom:10}}>{editing==='new'?'새 카테고리 추가':'카테고리 수정'}</div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <Field label="카테고리 이름">
                <input style={inp} value={form.label} placeholder="예: 산책" onChange={e=>setForm(f=>({...f,label:e.target.value}))}/>
              </Field>
              <Field label="이모지">
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {EMOJI_LIST.map(e=>(
                    <button key={e} onClick={()=>setForm(f=>({...f,emoji:e}))} style={{background:form.emoji===e?'#2c1500':'transparent',border:`1.5px solid ${form.emoji===e?'#2c1500':'#dbc9aa'}`,borderRadius:5,padding:'4px 7px',fontSize:17,cursor:'pointer'}}>{e}</button>
                  ))}
                </div>
              </Field>
              <Field label="색상">
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {['#8B0000','#1a3a5c','#2d5a16','#4a1060','#7a3900','#0a4a3a','#5c2d00','#1a1a4e','#7a1f1f','#004d40','#5a3060','#5a5a5a'].map(c=>(
                    <button key={c} onClick={()=>setForm(f=>({...f,color:c}))} style={{width:28,height:28,borderRadius:'50%',background:c,border:'none',cursor:'pointer',outline:form.color===c?'3px solid #2c1500':'2px solid transparent',outlineOffset:2}}/>
                  ))}
                </div>
              </Field>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setEd(null)} style={{flex:1,background:'transparent',border:'1px solid #dbc9aa',borderRadius:4,padding:'8px',cursor:'pointer',fontFamily:'serif',fontSize:12}}>취소</button>
                <button onClick={saveEdit} disabled={!form.label.trim()} style={{flex:2,background:'#2c1500',color:'#f5c842',border:'none',borderRadius:4,padding:'8px',cursor:'pointer',fontFamily:'serif',fontSize:12,fontWeight:700,opacity:!form.label.trim()?0.4:1}}>저장</button>
              </div>
            </div>
          </div>
        )}

        {editing===null && (
          <button onClick={startNew} style={{width:'100%',background:'transparent',border:'2px dashed #a8d880',borderRadius:5,padding:'10px',fontSize:13,cursor:'pointer',fontFamily:'serif',color:'#2d5a16',marginBottom:14}}>+ 새 카테고리 추가</button>
        )}

        <button onClick={()=>onSave(list)} style={{width:'100%',background:'#2c1500',color:'#f5c842',border:'none',borderRadius:5,padding:12,fontSize:14,fontFamily:'serif',fontWeight:700,cursor:'pointer'}}>💾 저장</button>
      </div>
    </div>
  )
}

/* ─── 방문 타임라인 ─────────────────────────────────── */
function VisitTimeline({trip, onUpdate}) {
  const [adding,setAdding]   = useState(false)
  const [range,setRange]     = useState(false)
  const [newDate,setND]      = useState('')
  const [newDateTo,setNDT]   = useState('')
  const [newMemo,setNM]      = useState('')
  const [editId,setEI]       = useState(null)
  const [editMemo,setEM]     = useState('')

  const raw   = (trip.visits?.length>0) ? trip.visits : [{id:'fb',date:trip.date||'',memo:''}]
  const visits= [...raw].sort((a,b)=>(b.dateTo||b.date||'').localeCompare(a.dateTo||a.date||''))

  const addV = () => {
    if (!newDate) return
    const v={id:Date.now(),date:newDate,memo:newMemo}
    if (range&&newDateTo&&newDateTo>newDate) v.dateTo=newDateTo
    onUpdate({...trip,visits:[...raw,v]})
    setAdding(false); setRange(false); setND(''); setNDT(''); setNM('')
  }
  const saveE = id => { onUpdate({...trip,visits:raw.map(v=>v.id===id?{...v,memo:editMemo}:v)}); setEI(null) }
  const delV  = id => { if(raw.length>1) onUpdate({...trip,visits:raw.filter(v=>v.id!==id)}) }

  return (
    <div style={{marginBottom:14}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
        <div style={{fontSize:12,color:'#4a2800',fontWeight:700}}>
          📋 방문 기록 <span style={{background:'#2c1500',color:'#f5c842',borderRadius:20,padding:'1px 8px',fontSize:10}}>{Math.max(visits.length,1)}회</span>
        </div>
        <button onClick={()=>setAdding(a=>!a)} style={{background:'#2c1500',color:'#f5c842',border:'none',borderRadius:20,padding:'4px 12px',fontSize:11,cursor:'pointer',fontFamily:'serif'}}>
          {adding?'취소':'+ 재방문 추가'}
        </button>
      </div>
      {adding && (
        <div style={{background:'#f5ead0',borderRadius:6,padding:12,marginBottom:10,display:'flex',flexDirection:'column',gap:8}}>
          <div style={{display:'flex',gap:5}}>
            {['당일','기간'].map((label,i)=>(
              <button key={label} onClick={()=>setRange(i===1)} style={{flex:1,background:range===(i===1)?'#2c1500':'transparent',color:range===(i===1)?'#f5c842':'#9a7a5a',border:`1.5px solid ${range===(i===1)?'#2c1500':'#dbc9aa'}`,borderRadius:4,padding:'5px',fontSize:12,cursor:'pointer',fontFamily:'serif'}}>{label}</button>
            ))}
          </div>
          {range
            ? <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <input type="date" value={newDate} onChange={e=>setND(e.target.value)} style={{flex:1,padding:'7px 8px',border:'1.5px solid #dbc9aa',borderRadius:4,fontFamily:'serif',fontSize:12,outline:'none'}}/>
                <span style={{color:'#9a7a5a'}}>~</span>
                <input type="date" value={newDateTo} onChange={e=>setNDT(e.target.value)} min={newDate} style={{flex:1,padding:'7px 8px',border:'1.5px solid #dbc9aa',borderRadius:4,fontFamily:'serif',fontSize:12,outline:'none'}}/>
              </div>
            : <input type="date" value={newDate} onChange={e=>setND(e.target.value)} style={{padding:'7px 10px',border:'1.5px solid #dbc9aa',borderRadius:4,fontFamily:'serif',fontSize:13,outline:'none'}}/>
          }
          <textarea value={newMemo} onChange={e=>setNM(e.target.value)} placeholder="이번 방문 메모 (선택)" rows={2}
            style={{padding:'7px 10px',border:'1.5px solid #dbc9aa',borderRadius:4,fontFamily:'serif',fontSize:13,outline:'none',resize:'vertical',lineHeight:1.65}}/>
          <button onClick={addV} disabled={!newDate||(range&&!newDateTo)} style={{background:'#2c1500',color:'#f5c842',border:'none',borderRadius:4,padding:'8px',fontSize:13,cursor:'pointer',fontFamily:'serif',fontWeight:700,opacity:(!newDate||(range&&!newDateTo))?0.4:1}}>
            🎫 기록 추가
          </button>
        </div>
      )}
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {visits.map((v,i)=>(
          <div key={v.id} style={{display:'flex',gap:10,alignItems:'flex-start'}}>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',flexShrink:0}}>
              <div style={{width:10,height:10,borderRadius:'50%',background:i===0?'#2c1500':'#c9b89a',border:'2px solid #fff',marginTop:4}}/>
              {i<visits.length-1&&<div style={{width:2,flex:1,minHeight:20,background:'#e8d5b7',marginTop:3}}/>}
            </div>
            <div style={{flex:1,background:i===0?'#fff9ee':'#fffcf2',border:`1px solid ${i===0?'#e8d5b7':'#f0e8d8'}`,borderRadius:5,padding:'8px 10px',marginBottom:4}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:12,fontWeight:700,color:i===0?'#2c1500':'#9a7a5a'}}>{fmtVisit(v)}</span>
                {i===0&&<span style={{fontSize:9,background:'#2c1500',color:'#f5c842',borderRadius:20,padding:'1px 7px'}}>최근</span>}
                <div style={{marginLeft:'auto',display:'flex',gap:4}}>
                  <button onClick={()=>{setEI(editId===v.id?null:v.id);setEM(v.memo||'')}} style={{background:'none',border:'none',cursor:'pointer',fontSize:11,color:'#9a7a5a',padding:'1px 4px'}}>✏️</button>
                  {visits.length>1&&<button onClick={()=>delV(v.id)} style={{background:'none',border:'none',cursor:'pointer',fontSize:11,color:'#c0392b',padding:'1px 4px'}}>🗑</button>}
                </div>
              </div>
              {editId===v.id
                ? <div style={{display:'flex',flexDirection:'column',gap:5,marginTop:6}}>
                    <textarea value={editMemo} onChange={e=>setEM(e.target.value)} rows={2} style={{padding:'6px 8px',border:'1.5px solid #dbc9aa',borderRadius:4,fontFamily:'serif',fontSize:12,outline:'none',resize:'vertical',lineHeight:1.65}}/>
                    <div style={{display:'flex',gap:5}}>
                      <button onClick={()=>setEI(null)} style={{flex:1,background:'transparent',border:'1px solid #dbc9aa',borderRadius:4,padding:'5px',cursor:'pointer',fontFamily:'serif',fontSize:11}}>취소</button>
                      <button onClick={()=>saveE(v.id)} style={{flex:2,background:'#2c1500',color:'#f5c842',border:'none',borderRadius:4,padding:'5px',cursor:'pointer',fontFamily:'serif',fontSize:11,fontWeight:700}}>저장</button>
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
function StampCard({trip, cat, onDetail, onEdit, delay}) {
  const [h,setH]=useState(false)
  const lv=[...(trip.visits||[])].sort((a,b)=>(b.dateTo||b.date||'').localeCompare(a.dateTo||a.date||''))[0]
  const color = cat?.color||'#5a5a5a'
  const emoji = cat?.emoji||'📍'
  const label = cat?.label||'기타'
  return (
    <div style={{position:'relative',animation:`inkDrop 0.4s ${delay}s both`}}>
      <div onClick={onDetail} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
        style={{background:color,color:'#fff',borderRadius:6,overflow:'hidden',cursor:'pointer',transform:h?'rotate(-1.5deg) scale(1.04)':'',boxShadow:h?'6px 8px 20px rgba(0,0,0,0.28)':'2px 4px 12px rgba(0,0,0,0.16)',transition:'transform 0.18s,box-shadow 0.18s'}}>
        <div style={{height:5,background:`repeating-linear-gradient(90deg,${color} 0,${color} 4px,rgba(255,255,255,0.3) 4px,rgba(255,255,255,0.3) 8px)`}}/>
        <div style={{padding:'10px 10px 8px',textAlign:'center'}}>
          <div style={{fontSize:24,lineHeight:1,marginBottom:3}}>{emoji}</div>
          <div style={{fontSize:11,fontWeight:700}}>{label}</div>
          {trip.location&&<div style={{fontSize:9,opacity:0.8,marginTop:2}}>{trip.location.split(',').slice(0,1).join(', ')}</div>}
          <div style={{marginTop:8,display:'flex',gap:5,justifyContent:'center',alignItems:'center',flexWrap:'wrap'}}>
            <div style={{display:'inline-block',border:'1px solid rgba(255,255,255,0.45)',borderRadius:20,padding:'1px 8px',fontSize:8,opacity:0.9}}>{fmtVisit(lv)||trip.date}</div>
            {(trip.visits?.length||0)>=2&&<div style={{background:'rgba(255,255,255,0.25)',borderRadius:20,padding:'2px 8px',fontSize:9,fontWeight:700}}>{trip.visits.length}회</div>}
          </div>
        </div>
        <div style={{height:5,background:`repeating-linear-gradient(90deg,${color} 0,${color} 4px,rgba(255,255,255,0.3) 4px,rgba(255,255,255,0.3) 8px)`}}/>
      </div>
      <button onClick={e=>{e.stopPropagation();onEdit()}} style={{position:'absolute',top:14,right:10,background:'rgba(255,255,255,0.22)',border:'1px solid rgba(255,255,255,0.45)',borderRadius:20,padding:'2px 8px',fontSize:10,cursor:'pointer',color:'#fff'}}>✏️</button>
    </div>
  )
}

/* ─── 여행 추가/수정 모달 ───────────────────────────── */
function TripModal({onClose, onSave, initialTrip, cats}) {
  const isEdit = !!initialTrip
  const [catId,  setCatId]  = useState(initialTrip?.categoryId || cats[0]?.id || '')
  const [loc,    setLoc]    = useState(initialTrip?.location||'')
  const [lat,    setLat]    = useState(initialTrip?.lat||37.5665)
  const [lng,    setLng]    = useState(initialTrip?.lng||126.9780)
  const [fDate,  setFD]     = useState('')
  const [fDateTo,setFDT]    = useState('')
  const [fMemo,  setFM]     = useState('')
  const [range,  setRange]  = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [showCoord, setShowCoord] = useState(false)

  const cat = cats.find(c=>c.id===catId)
  const canSave = catId && (isEdit || (fDate && (!range||fDateTo)))

  const save = async () => {
    if (!canSave) return
    const trip = {
      id: isEdit?initialTrip.id:Date.now(),
      categoryId: catId,
      location: loc, lat, lng,
      visits: isEdit ? initialTrip.visits
        : [{id:Date.now(),date:fDate,...(range&&fDateTo?{dateTo:fDateTo}:{}),memo:fMemo}]
    }
    await onSave(trip)
    setSaved(true); setTimeout(onClose,1200)
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(20,8,0,0.6)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'#fffcf2',width:'100%',maxWidth:540,borderRadius:'12px 12px 0 0',padding:24,maxHeight:'90vh',overflowY:'auto',animation:'slideUp 0.3s ease both'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div style={{fontFamily:'Georgia,serif',fontSize:18,fontWeight:700,color:'#2c1500'}}>{isEdit?'여행 수정 ✏️':'새 여행 기록 ✍️'}</div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#9a7a5a'}}>✕</button>
        </div>
        {saved&&<div style={{background:'#2d5a16',color:'#fff',padding:12,borderRadius:6,textAlign:'center',marginBottom:16,fontSize:13}}>🎫 스탬프가 찍혔어요! 💛</div>}

        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <Field label="카테고리 *">
            <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
              {cats.map(c=>(
                <button key={c.id} onClick={()=>setCatId(c.id)} style={{
                  background:catId===c.id?c.color:'transparent',
                  color:catId===c.id?'#fff':'#4a2800',
                  border:`2px solid ${c.color}`,
                  borderRadius:8,padding:'8px 14px',fontSize:13,cursor:'pointer',fontFamily:'serif',
                  display:'flex',alignItems:'center',gap:6,transition:'all 0.15s'
                }}>
                  <span style={{fontSize:18}}>{c.emoji}</span> {c.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="장소 검색">
            <PlaceSearch value={loc} onSelect={({location,lat:lt,lng:lg})=>{setLoc(location);setLat(lt);setLng(lg)}}/>
            {/* 좌표 직접 입력 */}
            <div style={{marginTop:8}}>
              <button onClick={()=>setShowCoord(v=>!v)}
                style={{background:'transparent',border:'none',color:'#9a7a5a',fontSize:11,cursor:'pointer',padding:0,textDecoration:'underline'}}>
                {showCoord?'▲ 좌표 입력 닫기':'▼ 검색이 안 될 때 — 좌표 직접 입력'}
              </button>
              {showCoord&&(
                <div style={{marginTop:8,background:'#f5ead0',borderRadius:6,padding:12,display:'flex',flexDirection:'column',gap:8}}>
                  <div style={{fontSize:11,color:'#7a5a3a',lineHeight:1.6}}>
                    네이버/카카오 지도에서 장소 우클릭 → 좌표 복사<br/>
                    Google Maps URL: <code style={{fontSize:10}}>@위도,경도</code> 형태
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:10,color:'#9a7a5a',marginBottom:3}}>위도 (Latitude)</div>
                      <input style={inp} type="number" step="0.0001" value={lat}
                        onChange={e=>setLat(parseFloat(e.target.value)||37.5665)}
                        placeholder="예: 37.5796"/>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:10,color:'#9a7a5a',marginBottom:3}}>경도 (Longitude)</div>
                      <input style={inp} type="number" step="0.0001" value={lng}
                        onChange={e=>setLng(parseFloat(e.target.value)||126.9780)}
                        placeholder="예: 126.9770"/>
                    </div>
                  </div>
                  <input style={inp} value={loc} onChange={e=>setLoc(e.target.value)}
                    placeholder="장소명 직접 입력 (예: 창경궁)"/>
                  <div style={{fontSize:11,color:'#4a8020',background:'#edf7e0',borderRadius:4,padding:'5px 10px'}}>
                    ✓ 현재 좌표: {typeof lat==='number'?lat.toFixed(4):lat}, {typeof lng==='number'?lng.toFixed(4):lng}
                  </div>
                </div>
              )}
            </div>
          </Field>

          {!isEdit&&(
            <>
              <Field label="방문 날짜 *">
                <div style={{display:'flex',gap:5,marginBottom:7}}>
                  {['당일','기간'].map((label,i)=>(
                    <button key={label} onClick={()=>setRange(i===1)} style={{flex:1,background:range===(i===1)?'#2c1500':'transparent',color:range===(i===1)?'#f5c842':'#9a7a5a',border:`1.5px solid ${range===(i===1)?'#2c1500':'#dbc9aa'}`,borderRadius:4,padding:'6px',fontSize:12,cursor:'pointer',fontFamily:'serif'}}>{label}</button>
                  ))}
                </div>
                {range
                  ? <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <input style={{...inp,flex:1}} type="date" value={fDate} onChange={e=>setFD(e.target.value)}/>
                      <span style={{color:'#9a7a5a',fontSize:13}}>~</span>
                      <input style={{...inp,flex:1}} type="date" value={fDateTo} onChange={e=>setFDT(e.target.value)} min={fDate}/>
                    </div>
                  : <input style={inp} type="date" value={fDate} onChange={e=>setFD(e.target.value)}/>
                }
              </Field>
              <Field label="방문 메모">
                <textarea style={{...inp,resize:'vertical',lineHeight:1.75}} rows={2} value={fMemo} placeholder="이든이와 함께한 기억..." onChange={e=>setFM(e.target.value)}/>
              </Field>
            </>
          )}

          {/* 미리보기 */}
          {cat&&(
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:10,color:'#9a7a5a',marginBottom:6}}>미리보기</div>
              <div style={{display:'inline-block',background:cat.color,color:'#fff',borderRadius:5,overflow:'hidden',width:130}}>
                <div style={{height:6,background:`repeating-linear-gradient(90deg,${cat.color} 0,${cat.color} 4px,rgba(255,255,255,0.3) 4px,rgba(255,255,255,0.3) 8px)`}}/>
                <div style={{padding:'8px 10px',textAlign:'center'}}>
                  <div style={{fontSize:26}}>{cat.emoji}</div>
                  <div style={{fontSize:12,fontWeight:700,marginTop:3}}>{cat.label}</div>
                  <div style={{fontSize:9,opacity:0.8,marginTop:2}}>{loc.split(',')[0]||'장소'}</div>
                </div>
                <div style={{height:6,background:`repeating-linear-gradient(90deg,${cat.color} 0,${cat.color} 4px,rgba(255,255,255,0.3) 4px,rgba(255,255,255,0.3) 8px)`}}/>
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
function DetailModal({trip, cat, onClose, onDelete, onEdit, onUpdate}) {
  const [confirm,setConfirm]=useState(false)
  const color = cat?.color||'#5a5a5a'
  const emoji = cat?.emoji||'📍'
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(20,8,0,0.6)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'#fffcf2',width:'100%',maxWidth:540,borderRadius:'12px 12px 0 0',padding:24,maxHeight:'80vh',overflowY:'auto',animation:'slideUp 0.3s ease both'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <button onClick={onEdit} style={{background:'#f0e6d0',border:'1px solid #dbc9aa',borderRadius:5,padding:'5px 14px',fontSize:12,cursor:'pointer',fontFamily:'serif',color:'#4a2800'}}>✏️ 수정</button>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#9a7a5a'}}>✕</button>
        </div>
        <div style={{background:color,color:'#fff',borderRadius:6,overflow:'hidden',textAlign:'center',marginBottom:16}}>
          <div style={{height:12,background:`repeating-linear-gradient(90deg,${color} 0,${color} 6px,rgba(255,255,255,0.28) 6px,rgba(255,255,255,0.28) 12px)`}}/>
          <div style={{padding:'22px 20px'}}>
            <div style={{fontSize:58,lineHeight:1}}>{emoji}</div>
            <div style={{fontFamily:'Georgia,serif',fontSize:22,fontWeight:700,marginTop:8}}>{cat?.label||'기타'}</div>
            {trip.location&&<div style={{fontSize:12,opacity:0.8,marginTop:4}}>📍 {trip.location.split(',').slice(0,3).join(', ')}</div>}
            <div style={{marginTop:10,display:'inline-block',border:'1.5px solid rgba(255,255,255,0.5)',borderRadius:20,padding:'3px 16px',fontSize:12}}>📅 {latestDate(trip)}</div>
          </div>
          <div style={{height:12,background:`repeating-linear-gradient(90deg,${color} 0,${color} 6px,rgba(255,255,255,0.28) 6px,rgba(255,255,255,0.28) 12px)`}}/>
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
  const [list,setList]       = useState(shortcuts)
  const [defaultId,setDef]   = useState(defaultScId)
  const [adding,setAdding]   = useState(false)
  const [newLabel,setNL]     = useState('')
  const [searchQ,setSQ]      = useState('')
  const [searching,setSR]    = useState(false)
  const [found,setFound]     = useState(null)
  const [searchErr,setSE]    = useState('')

  const doSearch = async () => {
    if (!searchQ.trim()) return
    setSR(true); setFound(null); setSE('')
    const r = await geocode(searchQ)
    setSR(false)
    r.error ? setSE('장소를 찾지 못했어요.') : (setFound(r), setNL(r.name))
  }
  const add = () => {
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
        <div style={{marginBottom:14}}>
          {list.map((sc,i)=>(
            <div key={sc.id} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 10px',background:defaultId===sc.id?'#f0e8c8':'#f5ead0',borderRadius:5,marginBottom:5,border:`1.5px solid ${defaultId===sc.id?'#c9a840':'transparent'}`}}>
              <span style={{flex:1,fontSize:13,color:'#2c1500'}}>{sc.label}</span>
              {defaultId===sc.id
                ? <span style={{fontSize:10,background:'#f5c842',color:'#2c1500',borderRadius:20,padding:'2px 8px',fontWeight:700}}>⭐ 기본값</span>
                : <button onClick={()=>setDef(sc.id)} style={{background:'transparent',border:'1px solid #c9a840',borderRadius:20,padding:'2px 8px',fontSize:10,cursor:'pointer',color:'#8a7030'}}>⭐ 기본으로</button>
              }
              <button onClick={()=>setList(l=>l.filter((_,j)=>j!==i))} style={{background:'transparent',border:'1px solid #e8a090',borderRadius:4,padding:'2px 8px',fontSize:11,cursor:'pointer',color:'#c0392b'}}>삭제</button>
            </div>
          ))}
        </div>
        <div style={{borderTop:'1px solid #e8d5b7',paddingTop:14,marginBottom:14}}>
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
                    <div style={{background:'#edf7e0',borderRadius:4,padding:'8px 12px',fontSize:12,color:'#2c1500'}}>✓ {found.name}</div>
                    <input value={newLabel} onChange={e=>setNL(e.target.value)} placeholder="버튼에 표시할 이름" style={{padding:'8px 12px',border:'1.5px solid #dbc9aa',borderRadius:4,fontSize:13,fontFamily:'serif',outline:'none'}}/>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={()=>setAdding(false)} style={{flex:1,background:'transparent',border:'1px solid #dbc9aa',borderRadius:4,padding:8,cursor:'pointer',fontFamily:'serif'}}>취소</button>
                      <button onClick={add} style={{flex:2,background:'#2c1500',color:'#f5c842',border:'none',borderRadius:4,padding:8,cursor:'pointer',fontFamily:'serif',fontWeight:700}}>추가</button>
                    </div>
                  </>
                )}
                {!found&&!searchErr&&!searching&&<button onClick={()=>setAdding(false)} style={{background:'transparent',border:'1px solid #dbc9aa',borderRadius:4,padding:8,cursor:'pointer',fontFamily:'serif',color:'#9a7a5a',fontSize:12}}>취소</button>}
              </div>
          }
        </div>
        <button onClick={()=>onSave(list,defaultId)} style={{width:'100%',background:'#2c1500',color:'#f5c842',border:'none',borderRadius:5,padding:12,fontSize:14,fontFamily:'serif',fontWeight:700,cursor:'pointer'}}>💾 저장</button>
      </div>
    </div>
  )
}

/* ─── 지도 뷰 ───────────────────────────────────────── */
function MapView({trips, cats, shortcuts, defaultScId, onTripDetail, onEditShortcuts}) {
  const mapRef      = useRef(null)
  const containerRef= useRef(null)
  const markersRef  = useRef({})
  const leafletReady= useLeaflet()
  const [activeCats, setActiveCats] = useState(() => new Set(cats.map(c=>c.id)))

  useEffect(() => {
    if (!leafletReady||!containerRef.current||mapRef.current) return
    try {
      const LF = window.L
      const sc = shortcuts.find(s=>s.id===defaultScId)||shortcuts[0]
      const map = LF.map(containerRef.current,{center:[sc?.lat||36.5,sc?.lng||127.8],zoom:sc?.zoom||7,zoomControl:false})
      LF.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(map)
      LF.control.zoom({position:'bottomright'}).addTo(map)
      mapRef.current = map
    } catch(e) { console.warn('지도 초기화 오류:',e) }
  }, [leafletReady])

  useEffect(() => {
    if (!mapRef.current||!leafletReady) return
    try {
      const LF = window.L; const map = mapRef.current
      Object.values(markersRef.current).forEach(m=>map.removeLayer(m))
      markersRef.current = {}
      trips.forEach(trip => {
        const cat = cats.find(c=>c.id===trip.categoryId)
        if (!activeCats.has(trip.categoryId)) return
        const icon = LF.divIcon({
          html:`<div style="background:${cat?.color||'#5a5a5a'};color:#fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);width:34px;height:34px;display:flex;align-items:center;justify-content:center;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer"><span style="transform:rotate(45deg);font-size:16px">${cat?.emoji||'📍'}</span></div>`,
          iconSize:[34,34],iconAnchor:[17,34],popupAnchor:[0,-36],className:''
        })
        const marker = LF.marker([trip.lat,trip.lng],{icon}).addTo(map).bindPopup(`
          <div style="font-family:Georgia,serif;min-width:150px;padding:2px 0">
            <div style="font-weight:700;font-size:14px;color:#2c1500;margin-bottom:2px">${cat?.emoji||'📍'} ${cat?.label||'기타'}</div>
            <div style="font-size:11px;color:#9a7a5a;margin-bottom:8px">📅 ${latestDate(trip)}${trip.location?`<br>📍 ${trip.location.split(',').slice(0,2).join(', ')}`:''}
            </div>
            <button onclick="window.__tripDetail__('${trip.id}')"
              style="background:#2c1500;color:#f5c842;border:none;border-radius:4px;padding:5px 12px;font-size:12px;cursor:pointer;width:100%;font-family:serif">
              자세히 보기 →
            </button>
          </div>`,{maxWidth:230})
        markersRef.current[trip.id] = marker
      })
    } catch(e) { console.warn('마커 오류:',e) }
  }, [trips, cats, activeCats, leafletReady])

  useEffect(() => {
    window.__tripDetail__ = id => { const t=trips.find(t=>String(t.id)===String(id)); if(t) onTripDetail(t) }
    return () => { delete window.__tripDetail__ }
  }, [trips, onTripDetail])

  useEffect(() => () => { if(mapRef.current){try{mapRef.current.remove()}catch{}; mapRef.current=null} }, [])

  const flyTo = (lat,lng,zoom) => { if(mapRef.current) try{mapRef.current.flyTo([lat,lng],zoom,{duration:1})}catch{} }
  const usedCatIds = new Set(trips.map(t=>t.categoryId))
  const toggleCat = id => setActiveCats(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })

  return (
    <div>
      <div style={{display:'flex',gap:6,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:11,color:'#9a7a5a',whiteSpace:'nowrap'}}>바로가기:</span>
        {shortcuts.map(sc=>(
          <button key={sc.id} onClick={()=>flyTo(sc.lat,sc.lng,sc.zoom)}
            style={{background:'#2c1500',color:'#f5c842',border:'none',borderRadius:20,padding:'4px 12px',fontSize:11,cursor:'pointer',fontFamily:'serif',whiteSpace:'nowrap'}}>
            {sc.label}
          </button>
        ))}
        <button onClick={onEditShortcuts} style={{marginLeft:'auto',background:'transparent',border:'1.5px solid #dbc9aa',borderRadius:20,padding:'4px 12px',fontSize:11,cursor:'pointer',fontFamily:'serif',color:'#4a2800',whiteSpace:'nowrap'}}>⚙️ 편집</button>
      </div>

      {!leafletReady
        ? <div style={{height:440,display:'flex',alignItems:'center',justifyContent:'center',background:'#e8f4fd',borderRadius:8,color:'#5a7a9a',fontSize:14,gap:8}}>
            <span style={{fontSize:28}}>🌍</span> 지도를 불러오는 중...
          </div>
        : <div ref={containerRef} style={{height:440,borderRadius:8,overflow:'hidden',boxShadow:'1px 2px 12px rgba(0,0,0,0.14)'}}/>
      }

      {/* 카테고리 토글 */}
      {trips.length>0&&(
        <div style={{marginTop:12}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:7}}>
            <span style={{fontSize:11,color:'#9a7a5a'}}>카테고리 필터</span>
            <button onClick={()=>setActiveCats(new Set(cats.map(c=>c.id)))} style={{fontSize:10,background:'transparent',border:'1px solid #dbc9aa',borderRadius:20,padding:'2px 8px',cursor:'pointer',color:'#4a2800',fontFamily:'serif'}}>전체 ON</button>
            <button onClick={()=>setActiveCats(new Set())} style={{fontSize:10,background:'transparent',border:'1px solid #dbc9aa',borderRadius:20,padding:'2px 8px',cursor:'pointer',color:'#4a2800',fontFamily:'serif'}}>전체 OFF</button>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {cats.filter(c=>usedCatIds.has(c.id)).map(c=>(
              <button key={c.id} onClick={()=>toggleCat(c.id)}
                style={{background:activeCats.has(c.id)?c.color:'#e8d5b7',color:activeCats.has(c.id)?'#fff':'#9a7a5a',border:`1.5px solid ${activeCats.has(c.id)?c.color:'#dbc9aa'}`,borderRadius:20,padding:'4px 12px',fontSize:11,cursor:'pointer',fontFamily:'serif',whiteSpace:'nowrap',opacity:activeCats.has(c.id)?1:0.5,transition:'all 0.15s'}}>
                {c.emoji} {c.label} ({trips.filter(t=>t.categoryId===c.id).length})
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
  constructor(props){super(props);this.state={hasError:false,error:null}}
  static getDerivedStateFromError(e){return{hasError:true,error:e}}
  render(){
    if(this.state.hasError) return(
      <div style={{padding:40,textAlign:'center',fontFamily:'Georgia,serif',color:'#4a2800'}}>
        <div style={{fontSize:48,marginBottom:16}}>⚠️</div>
        <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>앱 오류</div>
        <div style={{fontSize:12,color:'#9a7a5a',marginBottom:24}}>{String(this.state.error)}</div>
        <button onClick={()=>window.location.reload()} style={{background:'#2c1500',color:'#f5c842',border:'none',borderRadius:5,padding:'10px 24px',fontSize:14,cursor:'pointer',fontFamily:'serif'}}>새로고침</button>
      </div>
    )
    return this.props.children
  }
}

/* ─── 메인 앱 ───────────────────────────────────────── */
function App() {
  const [cats, setCats]       = useState(() => {
    try { const s=lsGet(CAT_KEY); return s?JSON.parse(s):DEFAULT_CATS } catch { return DEFAULT_CATS }
  })
  const [trips, setTrips]     = useState(() => {
    try {
      const s=lsGet(TRIPS_KEY)
      const c=lsGet(CAT_KEY)
      const cs=c?JSON.parse(c):DEFAULT_CATS
      return s?migrateTrips(JSON.parse(s),cs):[]
    } catch { return [] }
  })
  const [shortcuts, setSC]    = useState(() => {
    try { const s=lsGet(SC_KEY); return s?JSON.parse(s):DEFAULT_SC } catch { return DEFAULT_SC }
  })
  const [defaultScId, setDSC] = useState(() => lsGet(DFLT_SC_KEY)||'korea')
  const [tab,   setTab]       = useState('stamps')
  const [modal, setModal]     = useState(null)
  const [sortBy,setSortBy]    = useState('date_desc')

  // Firebase 백그라운드 동기화
  useEffect(() => {
    import('./firebase.js').then(({storageGet})=>{
      storageGet(CAT_KEY).then(s=>{ if(s){const p=JSON.parse(s);setCats(p);lsSet(CAT_KEY,s)} }).catch(()=>{})
      storageGet(TRIPS_KEY).then(s=>{ if(s){const p=migrateTrips(JSON.parse(s),cats);setTrips(p);lsSet(TRIPS_KEY,JSON.stringify(p))} }).catch(()=>{})
      storageGet(SC_KEY).then(s=>{ if(s){const p=JSON.parse(s);setSC(p);lsSet(SC_KEY,s)} }).catch(()=>{})
    })
  }, [])

  const saveTrips = next => { persist(TRIPS_KEY,next); setTrips(next) }
  const saveCats  = next => { persist(CAT_KEY,next); setCats(next); setModal(null) }
  const saveSC    = (next,defId) => { persist(SC_KEY,next); setSC(next); if(defId!==undefined){lsSet(DFLT_SC_KEY,defId);setDSC(defId)}; setModal(null) }

  const saveTrip  = trip => { const ex=trips.some(t=>t.id===trip.id); saveTrips(ex?trips.map(t=>t.id===trip.id?trip:t):[...trips,trip]) }
  const delTrip   = id  => saveTrips(trips.filter(t=>t.id!==id))

  const sorted = [...trips].sort((a,b)=>{
    if(sortBy==='date_desc') return latestDate(b).localeCompare(latestDate(a))
    if(sortBy==='date_asc')  return latestDate(a).localeCompare(latestDate(b))
    const ca=cats.find(c=>c.id===a.categoryId)?.label||''
    const cb=cats.find(c=>c.id===b.categoryId)?.label||''
    return ca.localeCompare(cb,'ko')
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
        {tab==='stamps'&&(
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
                    {[{label:'총 여행',value:`${trips.length}곳`},{label:'올해',value:`${trips.filter(t=>latestDate(t).startsWith(new Date().getFullYear().toString())).length}회`}].map(s=>(
                      <div key={s.label} style={{flex:1,background:'#fffcf2',boxShadow:'1px 2px 8px rgba(0,0,0,0.08)',borderRadius:4,padding:'10px 14px',textAlign:'center'}}>
                        <div style={{fontSize:18,fontWeight:700,color:'#2c1500'}}>{s.value}</div>
                        <div style={{fontSize:10,color:'#9a7a5a',marginTop:2}}>{s.label}</div>
                      </div>
                    ))}
                    <button onClick={()=>setModal({type:'cats'})} style={{background:'#fffcf2',boxShadow:'1px 2px 8px rgba(0,0,0,0.08)',borderRadius:4,padding:'10px 14px',border:'none',cursor:'pointer',fontSize:12,fontFamily:'serif',color:'#4a2800'}}>
                      🏷️<br/><span style={{fontSize:10,color:'#9a7a5a'}}>카테고리</span>
                    </button>
                  </div>
                  <div style={{display:'flex',gap:5,marginBottom:14,alignItems:'center'}}>
                    <span style={{fontSize:11,color:'#9a7a5a',marginRight:2}}>정렬:</span>
                    {[{key:'date_desc',label:'📅 최신순'},{key:'date_asc',label:'📅 오래된순'},{key:'name',label:'🏷️ 카테고리순'}].map(o=>(
                      <button key={o.key} onClick={()=>setSortBy(o.key)} style={{background:sortBy===o.key?'#2c1500':'transparent',color:sortBy===o.key?'#f5c842':'#9a7a5a',border:`1.5px solid ${sortBy===o.key?'#2c1500':'#dbc9aa'}`,borderRadius:20,padding:'3px 11px',fontSize:11,cursor:'pointer',fontFamily:'serif',transition:'all 0.15s'}}>{o.label}</button>
                    ))}
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                    {sorted.map((trip,i)=>(
                      <StampCard key={trip.id} trip={trip} cat={cats.find(c=>c.id===trip.categoryId)} delay={i*0.05}
                        onDetail={()=>setModal({type:'detail',trip})}
                        onEdit={()=>setModal({type:'edit',trip})}/>
                    ))}
                  </div>
                </>
            }
            <button onClick={()=>setModal({type:'add'})} style={{position:'fixed',bottom:28,right:22,width:56,height:56,borderRadius:'50%',background:'#2c1500',color:'#f5c842',border:'3px solid #f5c842',fontSize:28,cursor:'pointer',boxShadow:'0 4px 16px rgba(0,0,0,0.35)',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
          </>
        )}

        {tab==='map'&&(
          <MapView trips={trips} cats={cats} shortcuts={shortcuts} defaultScId={defaultScId}
            onTripDetail={trip=>setModal({type:'detail',trip})}
            onEditShortcuts={()=>setModal({type:'shortcuts'})}/>
        )}
      </div>

      {(modal?.type==='add'||modal?.type==='edit')&&(
        <TripModal cats={cats} initialTrip={modal.type==='edit'?modal.trip:null} onClose={()=>setModal(null)} onSave={async t=>{saveTrip(t)}}/>
      )}
      {modal?.type==='detail'&&(
        <DetailModal trip={modal.trip} cat={cats.find(c=>c.id===modal.trip.categoryId)} onClose={()=>setModal(null)}
          onDelete={()=>{delTrip(modal.trip.id);setModal(null)}}
          onEdit={()=>setModal({type:'edit',trip:modal.trip})}
          onUpdate={t=>{saveTrip(t);setModal({type:'detail',trip:t})}}/>
      )}
      {modal?.type==='shortcuts'&&(
        <ShortcutsModal shortcuts={shortcuts} defaultScId={defaultScId} onClose={()=>setModal(null)} onSave={saveSC}/>
      )}
      {modal?.type==='cats'&&(
        <CategoryModal cats={cats} onClose={()=>setModal(null)} onSave={saveCats}/>
      )}
    </div>
  )
}

export default function AppWithBoundary() {
  return <RootErrorBoundary><App/></RootErrorBoundary>
}
