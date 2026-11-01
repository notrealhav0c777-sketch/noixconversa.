import { useEffect, useRef, useState } from 'react'
import { sb, configured } from './supabase'

const MIN = +import.meta.env.VITE_MIN_PEOPLE || 2
const MAX = +import.meta.env.VITE_MAX_PEOPLE || 50
const MAX_FILE = 5 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ERR = {
  ROOM_NOT_FOUND: 'Sala não encontrada. Confira o código.',
  ROOM_FULL: 'Esta sala já atingiu o limite de participantes.',
  INVALID_LIMIT: `O limite deve ficar entre ${MIN} e ${MAX} pessoas.`,
  NOT_MEMBER: 'Você não faz mais parte desta sala.',
}
const errText = (e) => {
  const m = e?.message || ''
  for (const k in ERR) if (m.includes(k)) return ERR[k]
  return 'Algo deu errado. Verifique sua conexão e tente novamente.'
}
const load = () => { try { return JSON.parse(localStorage.getItem('nc') || '{}') } catch { return {} } }
const save = (p) => localStorage.setItem('nc', JSON.stringify(p))

// Recorte "cover": preenche o tamanho alvo sem deformar a imagem
function cover(img, w, h, q = 0.85) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const s = Math.max(w / img.width, h / img.height)
  const dw = img.width * s, dh = img.height * s
  c.getContext('2d').drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
  return c.toDataURL('image/jpeg', q)
}

function Avatar({ src, name, size = 36 }) {
  return src
    ? <img className="avatar" style={{ width: size, height: size }} src={src} alt="" />
    : <span className="avatar ph" style={{ width: size, height: size, fontSize: size * 0.42 }}>{(name || '?')[0].toUpperCase()}</span>
}

export default function App() {
  const [profile, setProfile] = useState(() => {
    const p = load(); return { id: p.id || crypto.randomUUID(), name: p.name || '', avatar: p.avatar || '' }
  })
  const [view, setView] = useState('home')
  const [room, setRoom] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => save(profile), [profile])

  if (!configured) return (
    <main className="home"><div className="error">Configuração incompleta: adicione VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis da Vercel e faça um Redeploy.</div></main>
  )

  async function enter(code) {
    if (!profile.name.trim()) { setView('home'); return setError('Defina um nome ou apelido antes de continuar.') }
    setBusy(true); setError('')
    const { data, error } = await sb.rpc('join_room', { p_code: code, p_member: profile.id, p_name: profile.name, p_avatar: profile.avatar || null })
    setBusy(false)
    if (error) { setView('home'); return setError(errText(error)) }
    setRoom(data); setView('room')
  }
  async function leave() {
    await sb.rpc('leave_room', { p_member: profile.id }); setRoom(null); setView('home')
  }

  if (view === 'room' && room) return <Room room={room} me={profile} onLeave={leave} />
  return (
    <main className="home">
      <header className="brand"><img src="/logo.png" alt="NoixConversa" /><h1>NoixConversa</h1></header>
      <p className="sub">Salas privadas, entrada por código.</p>
      <ProfileCard profile={profile} setProfile={setProfile} />
      {error && <div className="error" role="alert">{error}</div>}
      <div className="actions">
        <section className="panel">
          <h2>Criar sala</h2>
          <p>Defina o limite de pessoas e receba um código para compartilhar.</p>
          <button className="btn primary" onClick={() => {
            if (!profile.name.trim()) return setError('Defina um nome ou apelido antes de criar uma sala.')
            setError(''); setView('create')
          }}>Criar sala</button>
        </section>
        <JoinPanel busy={busy} onJoin={enter} />
      </div>
      {view === 'create' && <CreateModal onClose={() => setView('home')} onCreated={enter} />}
    </main>
  )
}

function ProfileCard({ profile, setProfile }) {
  const [pending, setPending] = useState(null)
  const [err, setErr] = useState('')
  const input = useRef()
  function pick(e) {
    const f = e.target.files[0]; e.target.value = ''
    if (!f) return
    if (!TYPES.includes(f.type)) return setErr('Use uma imagem JPG, JPEG, PNG ou WebP.')
    if (f.size > MAX_FILE) return setErr('A imagem deve ter no máximo 5 MB.')
    setErr('')
    const img = new Image()
    img.onload = () => {
      setPending({ preview: cover(img, 1350, 1028, 0.8), thumb: cover(img, 160, 160, 0.8) })
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => setErr('Não foi possível ler essa imagem.')
    img.src = URL.createObjectURL(f)
  }
  return (
    <section className="panel profile">
      <button className="avatar-btn" onClick={() => input.current.click()} aria-label="Escolher foto">
        <Avatar src={profile.avatar} name={profile.name} size={64} />
      </button>
      <div className="grow">
        <label htmlFor="nick">Seu nome ou apelido</label>
        <input id="nick" maxLength={24} value={profile.name} placeholder="Como você quer aparecer"
          onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
        <div className="row small">
          <button className="link" onClick={() => input.current.click()}>{profile.avatar ? 'Trocar foto' : 'Adicionar foto'}</button>
          {profile.avatar && <button className="link danger" onClick={() => setProfile({ ...profile, avatar: '' })}>Remover</button>}
        </div>
        {err && <div className="hint err">{err}</div>}
      </div>
      <input ref={input} type="file" accept=".jpg,.jpeg,.png,.webp" hidden onChange={pick} />
      {pending && (
        <div className="overlay" onClick={() => setPending(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Prévia da foto</h2>
            <img className="preview" src={pending.preview} alt="Prévia" />
            <p className="hint">Recorte automático a partir de 1350 × 1028 px.</p>
            <div className="row end">
              <button className="btn ghost" onClick={() => setPending(null)}>Cancelar</button>
              <button className="btn primary" onClick={() => { setProfile({ ...profile, avatar: pending.thumb }); setPending(null) }}>Usar foto</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function JoinPanel({ onJoin, busy }) {
  const [code, setCode] = useState('')
  return (
    <section className="panel">
      <h2>Entrar em uma sala</h2>
      <p>Digite o código que você recebeu.</p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); code.trim() && onJoin(code) }}>
        <input className="code" maxLength={6} value={code} placeholder="CÓDIGO"
          onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="Código da sala" />
        <button className="btn primary" disabled={busy || code.trim().length < 6}>Entrar</button>
      </form>
    </section>
  )
}

function CreateModal({ onClose, onCreated }) {
  const [n, setN] = useState(10)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function create(e) {
    e.preventDefault()
    if (!Number.isInteger(+n) || n < MIN || n > MAX) return setErr(`Informe um número inteiro entre ${MIN} e ${MAX}.`)
    setBusy(true)
    const { data, error } = await sb.rpc('create_room', { p_max: +n })
    setBusy(false)
    if (error) return setErr(errText(error))
    onCreated(data)
  }
  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={create}>
        <h2>Nova sala</h2>
        <label htmlFor="max">Quantas pessoas poderão participar desta sala?</label>
        <input id="max" type="number" min={MIN} max={MAX} value={n} onChange={(e) => setN(e.target.value)} />
        <div className="hint">Mínimo {MIN}, máximo {MAX}.</div>
        {err && <div className="error">{err}</div>}
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>Gerar código</button>
        </div>
      </form>
    </div>
  )
}

function Room({ room, me, onLeave }) {
  const [members, setMembers] = useState([])
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [side, setSide] = useState(false)
  const end = useRef()
  const code = room.code

  const fetchMembers = async () => {
    const { data } = await sb.from('members').select('id,name,avatar').eq('room_code', code).order('joined_at')
    if (data) setMembers(data)
  }
  useEffect(() => {
    sb.from('messages').select('*').eq('room_code', code).order('created_at').limit(200).then(({ data }) => data && setMsgs(data))
    fetchMembers()
    const ch = sb.channel('room-' + code)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_code=eq.${code}` },
        (p) => setMsgs((m) => (m.some((x) => x.id === p.new.id) ? m : [...m, p.new])))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `room_code=eq.${code}` }, fetchMembers)
      .subscribe()
    const beat = setInterval(() => {
      sb.rpc('join_room', { p_code: code, p_member: me.id, p_name: me.name, p_avatar: me.avatar || null }); fetchMembers()
    }, 30000)
    return () => { sb.removeChannel(ch); clearInterval(beat) }
  }, [code])
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [msgs])

  async function send(e) {
    e.preventDefault()
    const body = text.trim(); if (!body) return
    setText('')
    const { error } = await sb.rpc('send_message', { p_code: code, p_member: me.id, p_body: body })
    if (error) { setErr(errText(error)); setText(body) } else setErr('')
  }
  const avatarOf = (id) => members.find((m) => m.id === id)?.avatar
  const copy = () => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  return (
    <div className="room">
      <aside className={'side' + (side ? ' open' : '')}>
        <div className="side-head"><img src="/logo.png" alt="" /><b>NoixConversa</b></div>
        <div className="side-title">Participantes · {members.length}/{room.max}</div>
        <ul>{members.map((m) => (
          <li key={m.id}><Avatar src={m.avatar} name={m.name} size={32} /><span>{m.name}{m.id === me.id && ' (você)'}</span></li>
        ))}</ul>
        <button className="btn ghost" onClick={onLeave}>Sair da sala</button>
      </aside>
      <section className="chat">
        <header className="chat-head">
          <button className="icon menu" onClick={() => setSide(!side)} aria-label="Participantes">☰</button>
          <div className="grow"><b>Sala</b> <span className="codechip">{code}</span></div>
          <button className="btn small ghost" onClick={copy}>{copied ? 'Copiado' : 'Copiar código'}</button>
        </header>
        <div className="feed" onClick={() => setSide(false)}>
          {msgs.length === 0 && <div className="empty">Compartilhe o código <b>{code}</b> para convidar pessoas.</div>}
          {msgs.map((m, i) => {
            const mine = m.member_id === me.id
            const first = msgs[i - 1]?.member_id !== m.member_id
            return (
              <div key={m.id} className={'msg' + (mine ? ' mine' : '')}>
                {!mine && (first ? <Avatar src={avatarOf(m.member_id)} name={m.name} size={34} /> : <span style={{ width: 34 }} />)}
                <div className="bubble">
                  {!mine && first && <div className="who">{m.name}</div>}
                  <span>{m.body}</span>
                  <time>{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>
                </div>
              </div>
            )
          })}
          <div ref={end} />
        </div>
        {err && <div className="error bar">{err}</div>}
        <form className="composer" onSubmit={send}>
          <input value={text} maxLength={2000} placeholder="Escreva uma mensagem" onChange={(e) => setText(e.target.value)} />
          <button className="btn primary" disabled={!text.trim()}>Enviar</button>
        </form>
      </section>
    </div>
  )
}
