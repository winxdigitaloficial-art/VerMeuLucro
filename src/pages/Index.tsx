import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { auth, db, loginWithGoogle } from '@/lib/firebase';
import { signInAnonymously, onAuthStateChanged, User, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';

const STORE = 'caixacerto_v2';
const USERS_STORE = 'vermeulucro_users';
const DEFAULT_USERS = [{ email: 'jutahy@gmail.com', senha: 'Maria@2016', dica: 'Nome e ano' }];
const CATS_REC = ['Serviços', 'Vendas', 'Comissões', 'Outros'];
const CATS_DESP = ['Aluguel', 'Energia', 'Água', 'Internet/Telefone', 'Produtos/Insumos', 'Funcionários', 'Pró-labore', 'Impostos', 'Marketing', 'Equipamentos', 'Transporte', 'Combustível', 'Alimentação', 'Outros'];

interface Cliente { id: number; nome: string; telefone: string; cpf: string; dataNascimento?: string; }
interface Lancamento { id: number; mes: string; tipo: 'receita' | 'despesa'; status: 'pago' | 'pendente'; desc: string; valor: number; cat: string; data: string; clienteId?: number | null; dataPagamento?: string | null; }
interface Hora { id: number; mes: string; data: string; horas: number; obs: string; }
interface AppState { lancamentos: Lancamento[]; horas: Hora[]; metas: Record<string, number>; clientes: Cliente[]; plano?: string; }

function useSyncedState<T extends Record<string, any>>(key: string, initialValue: T, user: User | null, currentUserEmail: string | null) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      let item = window.localStorage.getItem(key);
      if (!item && key !== STORE) { const leg = window.localStorage.getItem(STORE); if (leg) { item = leg; window.localStorage.setItem(key, leg); } }
      return item ? { ...initialValue, ...JSON.parse(item) } : initialValue;
    } catch { return initialValue; }
  });
  const [syncStatus, setSyncStatus] = useState<'synced'|'error'|'syncing'>('syncing');

  useEffect(() => {
    try {
      let item = window.localStorage.getItem(key);
      if (!item && key !== STORE) { const leg = window.localStorage.getItem(STORE); if (leg) { item = leg; window.localStorage.setItem(key, leg); } }
      if (item) setStoredValue(prev => ({ ...initialValue, ...JSON.parse(item!) }));
    } catch {}
  }, [key]);

  useEffect(() => {
    const docId = currentUserEmail || (user ? user.uid : null);
    if (!docId) return;
    setSyncStatus('syncing');
    const docRef = doc(db, "users", docId);
    const unsub = onSnapshot(docRef, (snap) => {
      setSyncStatus('synced');
      if (snap.exists() && snap.data()[key]) {
        const cloud = snap.data()[key];
        const local = window.localStorage.getItem(key);
        if (local) {
          const ld = JSON.parse(local);
          const ll = (ld.lancamentos?.length||0)+(ld.clientes?.length||0);
          const cl = (cloud.lancamentos?.length||0)+(cloud.clientes?.length||0);
          if (ll > cl) { setDoc(docRef,{[key]:ld},{merge:true}); setStoredValue(prev=>({...initialValue,...ld})); return; }
        }
        setStoredValue(prev=>({...initialValue,...cloud}));
        window.localStorage.setItem(key, JSON.stringify({...initialValue,...cloud}));
      } else {
        const local = window.localStorage.getItem(key);
        if (local) { const p=JSON.parse(local); if ((p.lancamentos?.length||0)+(p.clientes?.length||0)>0) setDoc(docRef,{[key]:p},{merge:true}); }
      }
    }, (err) => { console.warn("Firestore:", err.message); setSyncStatus('error'); });
    return () => unsub();
  }, [user, key, currentUserEmail]);

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      setStoredValue(prev => {
        const v = value instanceof Function ? value(prev) : value;
        window.localStorage.setItem(key, JSON.stringify(v));
        const docId = currentUserEmail || (user ? user.uid : null);
        if (docId) {
          setSyncStatus('syncing');
          const ref = doc(db,"users",docId);
          setDoc(ref,{[key]:JSON.parse(JSON.stringify(v))},{merge:true}).then(()=>setSyncStatus('synced')).catch(()=>setSyncStatus('error'));
        }
        return v;
      });
    } catch {}
  };
  return [storedValue, setValue, syncStatus] as const;
}

const fmtBRL = (v: number) => 'R$ ' + Math.abs(v).toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2});
const fmtBRLShort = (v: number) => v >= 1000 ? 'R$ '+(v/1000).toFixed(1).replace('.',',')+' k' : 'R$ '+Math.round(v);
const getMesNome = (ym: string) => { const [y,m]=ym.split('-'); const mes=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']; return mes[parseInt(m)-1]+' '+y; };
const fmtData = (d: string) => { if(!d) return ''; const [,m,dia]=d.split('-'); return dia+'/'+m; };

export default function Index() {
  const [currentUser, setCurrentUser] = useState(() => sessionStorage.getItem('caixacerto_auth'));
  const [firebaseUser, setFirebaseUser] = useState<User|null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginSenha, setLoginSenha] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginDica, setLoginDica] = useState('');
  const [loginError, setLoginError] = useState('');
  const [esqueciSenha, setEsqueciSenha] = useState(false);
  const [usuarios, setUsuarios] = useState(() => { try { const i=window.localStorage.getItem(USERS_STORE); return i?JSON.parse(i):DEFAULT_USERS; } catch { return DEFAULT_USERS; } });
  useEffect(() => { window.localStorage.setItem(USERS_STORE, JSON.stringify(usuarios)); }, [usuarios]);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) { setFirebaseUser(user); if(user.email){ const e=user.email.toLowerCase().trim(); sessionStorage.setItem('caixacerto_auth',e); setCurrentUser(e); } }
      else { signInAnonymously(auth).catch(()=>{}); }
    });
    return ()=>unsub();
  }, []);

  const dataStoreKey = currentUser ? `vermeulucro_data_${currentUser}` : STORE;
  const [state, setState, syncStatus] = useSyncedState<AppState>(dataStoreKey, {lancamentos:[],horas:[],metas:{},clientes:[],plano:'base'}, firebaseUser, currentUser);
  const [mesAtual, setMesAtual] = useState(new Date().toISOString().slice(0,7));
  const [activeTab, setActiveTab] = useState('dashboard');
  const [upgradeType, setUpgradeType] = useState<'nuvem'|'ouro'|null>(null);
  useEffect(() => { const r=Math.random(); if(r<0.15) setUpgradeType('nuvem'); else if(r<0.3) setUpgradeType('ouro'); else setUpgradeType(null); }, []);
  const [tipoAtual, setTipoAtual] = useState<'receita'|'despesa'>('receita');
  const [statusAtual, setStatusAtual] = useState<'pago'|'pendente'>('pago');
  const [descInput, setDescInput] = useState('');
  const [valorInput, setValorInput] = useState('');
  const [catInput, setCatInput] = useState(CATS_REC[0]);
  const [dataInput, setDataInput] = useState(new Date().toISOString().slice(0,10));
  const [parcelasInput, setParcelasInput] = useState('1');
  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [clienteCpf, setClienteCpf] = useState('');
  const [clienteNascimento, setClienteNascimento] = useState('');
  const [clienteId, setClienteId] = useState<number|null>(null);
  const [editingLancamentoId, setEditingLancamentoId] = useState<number|null>(null);
  const [cobrarLancamento, setCobrarLancamento] = useState<Lancamento|null>(null);
  const [baixaModal, setBaixaModal] = useState<Lancamento|null>(null);
  const [baixaValor, setBaixaValor] = useState('');
  const [baixaData, setBaixaData] = useState('');
  const [hDataInput, setHDataInput] = useState(new Date().toISOString().slice(0,10));
  const [hHorasInput, setHHorasInput] = useState('');
  const [hObsInput, setHObsInput] = useState('');
  const [selectedClienteId, setSelectedClienteId] = useState<number|null>(null);
  const [suporteMsg, setSuporteMsg] = useState('');
  const [chatMessages, setChatMessages] = useState<{role:'user'|'ai',text:string}[]>([{role:'ai',text:'Olá! Sou seu assistente virtual. Como posso ajudar você a usar o Vermeulucro hoje?'}]);

  useEffect(() => { setCatInput(tipoAtual==='receita'?CATS_REC[0]:CATS_DESP[0]); }, [tipoAtual]);
  useEffect(() => {
    const today=new Date(); const cur=today.toISOString().slice(0,7);
    if(mesAtual===cur){ setDataInput(today.toISOString().slice(0,10)); setHDataInput(today.toISOString().slice(0,10)); }
    else { setDataInput(`${mesAtual}-01`); setHDataInput(`${mesAtual}-01`); }
  }, [mesAtual]);
  useEffect(() => {
    if(!state.lancamentos) return;
    if(state.lancamentos.some(l=>l.data&&l.mes!==l.data.slice(0,7)))
      setState(prev=>({...prev,lancamentos:(prev.lancamentos||[]).map(l=>({...l,mes:l.data?l.data.slice(0,7):l.mes}))}));
  }, [state.lancamentos]);

  const mudarMes=(d:number)=>{ const [y,m]=mesAtual.split('-').map(Number); const dt=new Date(y,m-1+d,1); setMesAtual(dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')); };
  const lancamentosMes=(state.lancamentos||[]).filter(l=>l.mes===mesAtual);
  const horasMes=(state.horas||[]).filter(h=>h.mes===mesAtual);

  const calcTotais=()=>{
    const recs=lancamentosMes.filter(l=>l.tipo==='receita');
    const desps=lancamentosMes.filter(l=>l.tipo==='despesa');
    const totalVendido=recs.reduce((a,l)=>a+l.valor,0);
    const totalRecebido=recs.filter(l=>l.status!=='pendente').reduce((a,l)=>a+l.valor,0);
    const aReceber=recs.filter(l=>l.status==='pendente').reduce((a,l)=>a+l.valor,0);
    const desp=desps.reduce((a,l)=>a+l.valor,0);
    return {rec:totalRecebido,desp,lucro:totalRecebido-desp,totalVendido,aReceber};
  };
  const {rec,desp,lucro,totalVendido,aReceber}=calcTotais();

  const handleLancar=()=>{
    const valor=parseFloat(valorInput.toString().replace(',','.'));
    if(!descInput||!valor||valor<=0){alert('Preencha descrição e valor.');return;}
    if(tipoAtual==='receita'&&(!clienteNome.trim()||!clienteTelefone.trim())){alert('Nome e telefone do cliente são obrigatórios.');return;}
    let cid=clienteId;
    if(tipoAtual==='receita'&&clienteNome.trim()){
      if(!cid){ const nc:Cliente={id:Date.now(),nome:clienteNome.trim(),telefone:clienteTelefone.trim(),cpf:clienteCpf.trim(),dataNascimento:clienteNascimento.trim()}; setState(prev=>({...prev,clientes:[...(prev.clientes||[]),nc]})); cid=nc.id; }
      else setState(prev=>({...prev,clientes:(prev.clientes||[]).map(c=>c.id===cid?{...c,nome:clienteNome.trim(),telefone:clienteTelefone.trim(),cpf:clienteCpf.trim(),dataNascimento:clienteNascimento.trim()}:c)}));
    }
    const dataFinal=dataInput||`${mesAtual}-01`;
    const mesL=dataFinal.slice(0,7);
    if(editingLancamentoId){ setState(prev=>({...prev,lancamentos:(prev.lancamentos||[]).map(l=>l.id===editingLancamentoId?{...l,tipo:tipoAtual,status:tipoAtual==='receita'?statusAtual:'pago',desc:descInput,valor,cat:catInput,data:dataFinal,mes:mesL,clienteId:cid||null}:l)})); setEditingLancamentoId(null); }
    else {
      const parc=parseInt(parcelasInput)||1;
      if(tipoAtual==='receita'&&statusAtual==='pendente'){
        const vp=valor/parc; const novos:Lancamento[]=[];
        for(let i=0;i<parc;i++){ const dt=new Date(dataFinal); dt.setMonth(dt.getMonth()+i+1); const dp=dt.toISOString().slice(0,10); novos.push({id:Date.now()+i,mes:dp.slice(0,7),tipo:tipoAtual,status:statusAtual,desc:parc>1?`${descInput} (${i+1}/${parc})`:descInput,valor:vp,cat:catInput,data:dp,clienteId:cid||null}); }
        setState(prev=>({...prev,lancamentos:[...(prev.lancamentos||[]),...novos]}));
      } else setState(prev=>({...prev,lancamentos:[...(prev.lancamentos||[]),{id:Date.now(),mes:mesL,tipo:tipoAtual,status:tipoAtual==='receita'?statusAtual:'pago',desc:descInput,valor,cat:catInput,data:dataFinal,clienteId:cid||null}]}));
    }
    setDescInput('');setValorInput('');setClienteNome('');setClienteTelefone('');setClienteCpf('');setClienteNascimento('');setClienteId(null);setStatusAtual('pago');setParcelasInput('1');
  };

  const iniciarEdicaoLancamento=(l:Lancamento)=>{ setTipoAtual(l.tipo);setStatusAtual(l.status||'pago');setDescInput(l.desc);setValorInput(l.valor.toString());setCatInput(l.cat);setDataInput(l.data); if(l.clienteId){const c=(state.clientes||[]).find(c=>c.id===l.clienteId);if(c){setClienteId(c.id);setClienteNome(c.nome);setClienteTelefone(c.telefone);setClienteCpf(c.cpf);setClienteNascimento(c.dataNascimento||'');}} else{setClienteId(null);setClienteNome('');setClienteTelefone('');setClienteCpf('');setClienteNascimento('');} setEditingLancamentoId(l.id);setActiveTab('lancar');window.scrollTo({top:0,behavior:'smooth'}); };
  const cancelarEdicao=()=>{setEditingLancamentoId(null);setDescInput('');setValorInput('');setClienteNome('');setClienteTelefone('');setClienteCpf('');setClienteNascimento('');setClienteId(null);};
  const deletarLanc=(id:number)=>setState(prev=>({...prev,lancamentos:(prev.lancamentos||[]).filter(l=>l.id!==id)}));
  const handleLancarHoras=()=>{ const h=parseFloat(hHorasInput.toString().replace(',','.')); if(!h||h<=0){alert('Informe as horas.');return;} const data=hDataInput||`${mesAtual}-01`; setState(prev=>({...prev,horas:[...(prev.horas||[]),{id:Date.now(),mes:data.slice(0,7),data,horas:h,obs:hObsInput.trim()}]})); setHHorasInput('');setHObsInput(''); };
  const deletarHora=(id:number)=>setState(prev=>({...prev,horas:(prev.horas||[]).filter(h=>h.id!==id)}));

  const enviarCobranca=(opcao:number,l:Lancamento)=>{
    const c=(state.clientes||[]).find(c=>c.id===l.clienteId);
    const nome=c?c.nome.split(' ')[0]:'Cliente';
    const num=c&&c.telefone?c.telefone.replace(/\D/g,''):'';
    const vs=l.valor.toLocaleString('pt-BR',{minimumFractionDigits:2});
    let msg='';
    if(opcao===1) msg=`Olá ${nome}, tudo bem? 😊 Passando apenas para lembrar que há um valor de R$ ${vs} em aberto. Quando tiver uma oportunidade, pode resolver pra gente? Qualquer dúvida é só falar!`;
    else if(opcao===2) msg=`Olá ${nome}! Tudo bem? Identificamos que o valor de R$ ${vs} ainda está pendente. Pode nos dar um retorno sobre o pagamento? Obrigado!`;
    else msg=`Olá ${nome}, boa tarde! Gostaríamos de regularizar o valor de R$ ${vs} que está em aberto. Por favor, entre em contato. Estamos à disposição!`;
    window.open(num?`https://wa.me/55${num}?text=${encodeURIComponent(msg)}`:`https://wa.me/?text=${encodeURIComponent(msg)}`,'_blank');
    setCobrarLancamento(null);
  };

  const iniciarBaixa=(l:Lancamento)=>{setBaixaModal(l);setBaixaValor(l.valor.toString());setBaixaData(new Date().toISOString().slice(0,10));};
  const confirmarBaixa=()=>{
    if(!baixaModal) return;
    const vp=parseFloat(baixaValor.toString().replace(',','.'));
    if(isNaN(vp)||vp<=0){alert('Valor inválido');return;}
    if(vp<baixaModal.valor){
      setState(prev=>({...prev,lancamentos:[...(prev.lancamentos||[]).map(l=>l.id===baixaModal.id?{...l,valor:l.valor-vp}:l),{...baixaModal,id:Date.now(),status:'pago',valor:vp,dataPagamento:baixaData,desc:baixaModal.desc+' (Parcial)'}]}));
    } else setState(prev=>({...prev,lancamentos:(prev.lancamentos||[]).map(l=>l.id===baixaModal.id?{...l,status:'pago',dataPagamento:baixaData,valor:vp}:l)}));
    setBaixaModal(null);
  };

  const editarMeta=()=>{ const at=(state.metas||{})[mesAtual]||0; const nv=prompt(`Meta para ${getMesNome(mesAtual)} (R$):`,String(at)); if(nv!==null&&!isNaN(parseFloat(nv))) setState(prev=>({...prev,metas:{...(prev.metas||{}),[mesAtual]:parseFloat(nv)}})); };
  const exportarCSV=()=>{ const h='Data,Tipo,Status,Cliente,Categoria,Descrição,Valor\n'; const r=lancamentosMes.map(l=>{const c=(state.clientes||[]).find(c=>c.id===l.clienteId);return `${l.data},${l.tipo},${l.status||'pago'},"${c?c.nome:''}",${l.cat},"${l.desc}",${l.valor.toFixed(2)}`;}).join('\n'); const b=new Blob(['\uFEFF'+h+r],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`vermeulucro-${mesAtual}.csv`;a.click(); };
  const exportarBackup=()=>{ const b=new Blob([JSON.stringify(state)],{type:'application/json'}); const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`vermeulucro_backup_${new Date().toISOString().slice(0,10)}.json`;a.click(); };
  const handleRestaurar=(e:React.ChangeEvent<HTMLInputElement>)=>{ const f=e.target.files?.[0];if(!f)return; const r=new FileReader();r.onload=(ev)=>{try{const p=JSON.parse(ev.target?.result as string);if(p&&Array.isArray(p.lancamentos)){setState(p);alert('Backup restaurado!');}else alert('Arquivo inválido.');}catch{alert('Erro ao ler arquivo.');}}; r.readAsText(f);e.target.value=''; };

  const exportarWhatsApp=()=>{
    const recs=[...lancamentosMes].filter(l=>l.tipo==='receita').sort((a,b)=>(a.data||'').localeCompare(b.data||''));
    const desps=[...lancamentosMes].filter(l=>l.tipo==='despesa').sort((a,b)=>(a.data||'').localeCompare(b.data||''));
    const totalVendido=recs.reduce((a,l)=>a+l.valor,0);
    const recebido=recs.filter(l=>l.status!=='pendente').reduce((a,l)=>a+l.valor,0);
    const aPend=recs.filter(l=>l.status==='pendente').reduce((a,l)=>a+l.valor,0);
    const totalDesp=desps.reduce((a,l)=>a+l.valor,0);
    const lucroLiq=recebido-totalDesp;
    const margem=recebido>0?((lucroLiq/recebido)*100).toFixed(1):'0';
    const icon=lucroLiq>0?'🟢':lucroLiq===0?'🟡':'🔴';
    const recCats:Record<string,number>={};
    recs.forEach(l=>{recCats[l.cat]=(recCats[l.cat]||0)+l.valor;});
    const despCats:Record<string,number>={};
    desps.forEach(l=>{despCats[l.cat]=(despCats[l.cat]||0)+l.valor;});
    const L:string[]=[];
    L.push(`📊 *RELATÓRIO — ${getMesNome(mesAtual).toUpperCase()}*`);
    L.push('');
    L.push('━━━━━━━━━━━━━━━━━━━━━');
    L.push(`💰 *RECEITAS — ${fmtBRL(totalVendido)}*`);
    L.push('━━━━━━━━━━━━━━━━━━━━━');
    if(Object.keys(recCats).length>0){Object.entries(recCats).sort((a,b)=>b[1]-a[1]).forEach(([cat,val])=>L.push(`▸ ${cat}: *${fmtBRL(val)}*`));L.push('');}
    if(recs.length===0) L.push('Nenhuma receita registrada.');
    else recs.forEach(l=>{const cli=l.clienteId?(state.clientes||[]).find(c=>c.id===l.clienteId):null;const nm=cli?` — ${cli.nome}`:'';const st=l.status==='pendente'?'⏳':'✅';L.push(`• ${fmtData(l.data)} ${l.desc}${nm} — ${fmtBRL(l.valor)} ${st}`);});
    L.push('');
    L.push(`✅ Recebido: *${fmtBRL(recebido)}*`);
    if(aPend>0) L.push(`⏳ A Receber: *${fmtBRL(aPend)}*`);
    L.push('');
    L.push('━━━━━━━━━━━━━━━━━━━━━');
    L.push(`💸 *DESPESAS — ${fmtBRL(totalDesp)}*`);
    L.push('━━━━━━━━━━━━━━━━━━━━━');
    if(Object.keys(despCats).length>0){Object.entries(despCats).sort((a,b)=>b[1]-a[1]).forEach(([cat,val])=>L.push(`▸ ${cat}: *${fmtBRL(val)}*`));L.push('');}
    if(desps.length===0) L.push('Nenhuma despesa registrada.');
    else desps.forEach(l=>L.push(`• ${fmtData(l.data)} ${l.desc} — ${fmtBRL(l.valor)}`));
    L.push('');
    L.push('━━━━━━━━━━━━━━━━━━━━━');
    L.push(`${icon} *LUCRO LÍQUIDO: ${fmtBRL(lucroLiq)}*`);
    L.push(`📈 Margem: ${margem}%`);
    L.push('━━━━━━━━━━━━━━━━━━━━━');
    L.push('_Gerado pelo VermeuLucro_ ✅');
    window.open(`https://wa.me/?text=${encodeURIComponent(L.join('\n'))}`,'_blank');
  };

  const handleAuth=async(e:React.FormEvent)=>{
    e.preventDefault(); const em=loginEmail.toLowerCase().trim();
    if(esqueciSenha){setLoginError('Para recuperar a senha, use o login pelo Google.');return;}
    setLoginError('Autenticando...');
    try {
      if(isRegistering){ await createUserWithEmailAndPassword(auth,em,loginSenha); sessionStorage.setItem('caixacerto_auth',em);setCurrentUser(em);setLoginError(''); }
      else {
        try { await signInWithEmailAndPassword(auth,em,loginSenha); sessionStorage.setItem('caixacerto_auth',em);setCurrentUser(em);setLoginError(''); }
        catch(err:any){
          if(err.code==='auth/invalid-credential'||err.code==='auth/user-not-found'){
            const lu=usuarios.find((u:any)=>u.email.toLowerCase()===em&&u.senha===loginSenha);
            if(lu){ await createUserWithEmailAndPassword(auth,em,loginSenha); sessionStorage.setItem('caixacerto_auth',em);setCurrentUser(em);setLoginError(''); }
            else setLoginError('E-mail ou senha incorretos.');
          } else throw err;
        }
      }
    } catch(error:any){
      if(error.code==='auth/email-already-in-use') setLoginError('E-mail já cadastrado. Tente fazer login.');
      else if(error.code==='auth/weak-password') setLoginError('A senha deve ter pelo menos 6 caracteres.');
      else { const lu=usuarios.find((u:any)=>u.email.toLowerCase()===em&&u.senha===loginSenha); if(lu){sessionStorage.setItem('caixacerto_auth',em);setCurrentUser(em);setLoginError('');}else setLoginError('Erro de conexão ou credenciais inválidas.'); }
    }
  };

  const handleLogout=()=>{ sessionStorage.removeItem('caixacerto_auth');setCurrentUser(null);setLoginEmail('');setLoginSenha(''); import('@/lib/firebase').then(({logout})=>logout()); };
  const handleGoogleLogin=async()=>{
    try { setLoginError('Abrindo Google...'); const user=await loginWithGoogle(); if(user&&user.email){const e=user.email.toLowerCase().trim();sessionStorage.setItem('caixacerto_auth',e);setCurrentUser(e);setLoginError('');} }
    catch(error:any){ if(error.code==='auth/popup-blocked') setLoginError('Permita pop-ups no navegador.'); else if(error.code==='auth/unauthorized-domain') setLoginError('Domínio não autorizado. Adicione no Firebase.'); else setLoginError('Erro ao entrar com Google.'); }
  };

  const chartData=useMemo(()=>{ const d=[]; for(let i=5;i>=0;i--){ const dt=new Date();dt.setMonth(dt.getMonth()-i); const ym=dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0'); const mls=(state.lancamentos||[]).filter(l=>l.mes===ym); const r=mls.filter(l=>l.tipo==='receita'&&l.status!=='pendente').reduce((a,l)=>a+l.valor,0); const dp=mls.filter(l=>l.tipo==='despesa').reduce((a,l)=>a+l.valor,0); d.push({name:getMesNome(ym).split(' ')[0].slice(0,3),Receita:r,Despesa:dp}); } return d; },[state.lancamentos]);

  const renderDashboard=()=>{
    const recs=lancamentosMes.filter(l=>l.tipo==='receita'); const desps=lancamentosMes.filter(l=>l.tipo==='despesa');
    let pc='status-pill bad',pt='No vermelho — atenção!';
    if(lucro>0&&lucro>=rec*0.2){pc='status-pill ok';pt='No azul — negócio saudável';}
    else if(lucro>0){pc='status-pill warn';pt='Positivo, mas margem baixa';}
    else if(lucro===0){pc='status-pill warn';pt='No limite — sem lucro';}
    const meta=(state.metas||{})[mesAtual]||0; const pct=meta>0?Math.min((rec/meta)*100,100):0; const falta=Math.max(desp-rec,0);
    const ultimos=[...lancamentosMes].sort((a,b)=>(b.data||'').localeCompare(a.data||'')).slice(0,5);
    return (
      <div>
        <div className="hero-balance">
          <div className="hero-label">Lucro líquido do mês</div>
          <div className={`hero-value ${lucro>=0?'pos':'neg'}`}>{fmtBRL(lucro)}</div>
          <div className="hero-sub">{recs.length} receitas · {desps.length} despesas</div>
          <div className={pc}><span className="dot"></span><span>{pt}</span></div>
        </div>
        <div className="metrics-row" style={{gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))'}}>
          <div className="metric"><div className="metric-label">Recebido</div><div className="metric-val pos">{fmtBRL(rec)}</div><div className="metric-sub">{recs.filter(r=>r.status!=='pendente').length} recebidas</div></div>
          <div className="metric"><div className="metric-label">A Receber</div><div className="metric-val" style={{color:'var(--amber)'}}>{fmtBRL(aReceber)}</div><div className="metric-sub">{recs.filter(r=>r.status==='pendente').length} pendentes</div></div>
          <div className="metric"><div className="metric-label">Despesas</div><div className="metric-val neg">{fmtBRL(desp)}</div><div className="metric-sub">{desps.length} lançamento{desps.length!==1?'s':''}</div></div>
        </div>
        <div className="card">
          <div className="flex-between" style={{marginBottom:'.4rem'}}><div className="section-title" style={{margin:0}}>Meta do mês</div><button className="btn-outline" style={{padding:'4px 10px',borderRadius:'6px',fontSize:'11px',border:'1px solid var(--border)',background:'transparent',color:'var(--muted)',cursor:'pointer'}} onClick={editarMeta}>Editar</button></div>
          <div className="meta-bar-bg"><div className={`meta-bar-fill ${pct>=100?'over':''}`} style={{width:`${pct}%`}}></div></div>
          <div className="meta-row"><span>{Math.round(pct)}% da meta</span><span>Meta: {fmtBRL(meta)}</span></div>
        </div>
        <div className="card">
          <div className="section-title">Ponto de equilíbrio</div>
          <div className="pe-row"><span className="pe-label">Total de despesas</span><span className="pe-val">{fmtBRL(desp)}</span></div>
          <div className="pe-row"><span className="pe-label">Total recebido</span><span className="pe-val">{fmtBRL(rec)}</span></div>
          <div className="pe-row"><span className="pe-label">Falta para cobrir despesas</span><span className="pe-val" style={{color:falta>0?'var(--amber)':'var(--green)'}}>{falta>0?fmtBRL(falta):'✓ Coberto'}</span></div>
        </div>
        <div className="card">
          <div className="section-title">Últimos lançamentos</div>
          {!ultimos.length?<div className="empty"><div className="empty-icon">📋</div>Nenhum lançamento ainda</div>:ultimos.map(l=>(
            <div className="lancamento-item" key={l.id}>
              <div className={`lanc-icon ${l.tipo==='receita'?'rec':'desp'}`}>{l.tipo==='receita'?'💰':'💸'}</div>
              <div className="lanc-info"><div className="lanc-desc">{l.cat}</div><div className="lanc-cat">{l.desc} · {fmtData(l.data)}</div></div>
              <div className={`lanc-val ${l.tipo==='receita'?(l.status==='pendente'?'text-amber-500':'rec'):'desp'}`}>{l.tipo==='receita'?'+':'-'}{fmtBRL(l.valor)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderLancar=()=>{
    const todos=[...lancamentosMes].sort((a,b)=>(b.data||'').localeCompare(a.data||''));
    const cats=tipoAtual==='receita'?CATS_REC:CATS_DESP;
    return (
      <div>
        <div className="tipo-toggle">
          <button className={`tipo-btn ${tipoAtual==='receita'?'active-rec':''}`} onClick={()=>setTipoAtual('receita')}>+ Receita</button>
          <button className={`tipo-btn ${tipoAtual==='despesa'?'active-desp':''}`} onClick={()=>setTipoAtual('despesa')}>− Despesa</button>
        </div>
        <div className="card">
          {tipoAtual==='receita'&&<div className="tipo-toggle mb-4"><button className={`tipo-btn ${statusAtual==='pago'?'active-rec':''}`} onClick={()=>setStatusAtual('pago')}>À vista (Pago)</button><button className={`tipo-btn ${statusAtual==='pendente'?'active-desp':''}`} style={statusAtual==='pendente'?{background:'var(--amber-dim)',borderColor:'var(--amber)',color:'var(--amber)'}:{}} onClick={()=>setStatusAtual('pendente')}>A prazo (Pendente)</button></div>}
          <div className="form-group"><label className="form-label">Descrição</label><input type="text" className="form-input" value={descInput} onChange={e=>setDescInput(e.target.value)} placeholder="Ex: Corte de cabelo, Energia..."/></div>
          <div className="form-group"><label className="form-label">Valor (R$)</label><div className="input-prefix-wrap"><span className="input-prefix">R$</span><input type="text" inputMode="decimal" className="form-input" value={valorInput} onChange={e=>setValorInput(e.target.value)} placeholder="0,00"/></div></div>
          <div className="form-group"><label className="form-label">Categoria</label><select className="form-input" value={catInput} onChange={e=>setCatInput(e.target.value)}>{cats.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Data</label><input type="date" className="form-input" value={dataInput} onChange={e=>setDataInput(e.target.value)}/></div>
          {tipoAtual==='receita'&&statusAtual==='pendente'&&!editingLancamentoId&&<div className="form-group"><label className="form-label">Número de Parcelas</label><input type="number" className="form-input" value={parcelasInput} onChange={e=>setParcelasInput(e.target.value)} min="1" step="1"/></div>}
          {tipoAtual==='receita'&&<div className="form-group" style={{borderTop:'1px solid var(--border)',paddingTop:'1rem',marginTop:'.5rem'}}><label className="form-label" style={{color:'var(--green)'}}>Dados do Cliente *</label><div style={{display:'flex',flexDirection:'column',gap:'10px'}}><datalist id="cl-list">{(state.clientes||[]).map(c=><option key={c.id} value={c.nome}/>)}</datalist><input type="text" list="cl-list" className="form-input" value={clienteNome} onChange={e=>{setClienteNome(e.target.value);const ex=(state.clientes||[]).find(c=>c.nome.toLowerCase()===e.target.value.toLowerCase());if(ex){setClienteTelefone(ex.telefone);setClienteCpf(ex.cpf);setClienteNascimento(ex.dataNascimento||'');setClienteId(ex.id);}else setClienteId(null);}} placeholder="Nome do Cliente"/><input type="text" className="form-input" value={clienteTelefone} onChange={e=>setClienteTelefone(e.target.value)} placeholder="Telefone / WhatsApp"/><input type="text" className="form-input" value={clienteCpf} onChange={e=>setClienteCpf(e.target.value)} placeholder="CPF (opcional)"/></div></div>}
          <div style={{display:'flex',gap:'8px'}}><button className={`btn flex-1 ${tipoAtual==='receita'?'btn-green':'btn-red'}`} onClick={handleLancar}>{editingLancamentoId?'Salvar Alteração':'Registrar lançamento'}</button>{editingLancamentoId&&<button className="btn btn-outline" style={{width:'auto',padding:'0 1rem'}} onClick={cancelarEdicao}>Cancelar</button>}</div>
        </div>
        <div className="card">
          <div className="section-title">Todos os lançamentos do mês</div>
          {!todos.length?<div className="empty"><div className="empty-icon">📋</div>Nenhum lançamento ainda</div>:todos.map(l=>(
            <div className="lancamento-item" key={l.id}>
              <div className={`lanc-icon ${l.tipo==='receita'?'rec':'desp'}`}>{l.tipo==='receita'?'💰':'💸'}</div>
              <div className="lanc-info"><div className="lanc-desc">{l.cat}{l.tipo==='receita'&&l.status==='pendente'&&<span className="badge" style={{background:'var(--amber-dim)',color:'var(--amber)',marginLeft:'6px'}}>Pendente</span>}</div><div className="lanc-cat">{l.desc} · {fmtData(l.data)}</div></div>
              <div className={`lanc-val ${l.tipo==='receita'?(l.status==='pendente'?'':'rec'):'desp'}`} style={l.status==='pendente'?{color:'var(--amber)'}:{}}>{l.tipo==='receita'?'+':'-'}{fmtBRL(l.valor)}</div>
              <div style={{display:'flex',gap:'4px',marginLeft:'8px'}}>
                {l.status==='pendente'&&<button style={{background:'none',border:'none',color:'var(--green)',cursor:'pointer',padding:'4px'}} onClick={()=>iniciarBaixa(l)} title="Dar Baixa">✓</button>}
                <button style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:'4px'}} onClick={()=>iniciarEdicaoLancamento(l)} title="Editar">✏️</button>
                <button style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:'4px'}} onClick={()=>deletarLanc(l.id)} title="Excluir">🗑</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderAReceber=()=>{
    const pend=(state.lancamentos||[]).filter(l=>l.tipo==='receita'&&l.status==='pendente').sort((a,b)=>(a.data||'').localeCompare(b.data||''));
    const total=pend.reduce((a,l)=>a+l.valor,0);
    return (
      <div>
        <div className="card" style={{textAlign:'center',marginBottom:'1rem'}}><div style={{fontSize:'11px',textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:'4px'}}>Total a Receber</div><div style={{fontSize:'2rem',fontWeight:'700',color:'var(--amber)'}}>{fmtBRL(total)}</div></div>
        <div className="card">
          <div className="section-title">Contas a Receber</div>
          {!pend.length?<div className="empty"><div className="empty-icon">✅</div>Tudo recebido!</div>:pend.map(l=>{
            const cl=(state.clientes||[]).find(c=>c.id===l.clienteId);
            return (
              <div key={l.id} style={{borderBottom:'1px solid var(--border)',padding:'.75rem 0'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'8px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'10px'}}><div className="lanc-icon" style={{background:'var(--amber-dim)',color:'var(--amber)'}}>⏳</div><div><div style={{fontSize:'13px',fontWeight:'500'}}>{cl?cl.nome:'Cliente não informado'}</div><div style={{fontSize:'11px',color:'var(--muted)'}}>{l.cat} · {l.desc} · {fmtData(l.data)}</div></div></div>
                  <div style={{fontSize:'14px',fontWeight:'600',color:'var(--amber)'}}>{fmtBRL(l.valor)}</div>
                </div>
                <div style={{display:'flex',gap:'8px'}}>
                  <button className="btn" style={{background:'rgba(34,197,94,.15)',color:'var(--green)',border:'1px solid rgba(34,197,94,.3)',padding:'8px',fontSize:'12px'}} onClick={()=>iniciarBaixa(l)}>✓ Dar Baixa</button>
                  <button className="btn" style={{background:'rgba(37,211,102,.1)',color:'#25D366',border:'1px solid rgba(37,211,102,.3)',padding:'8px',fontSize:'12px'}} onClick={()=>setCobrarLancamento(l)}>💬 Cobrar</button>
                </div>
              </div>
            );
          })}
        </div>
        {cobrarLancamento&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem',zIndex:200}}><div className="card" style={{width:'100%',maxWidth:'360px',position:'relative'}}><button style={{position:'absolute',top:'12px',right:'12px',background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'18px'}} onClick={()=>setCobrarLancamento(null)}>✕</button><div style={{fontSize:'16px',fontWeight:'700',marginBottom:'4px'}}>Cobrar via WhatsApp</div><div style={{fontSize:'13px',color:'var(--muted)',marginBottom:'16px'}}>Escolha o tom:</div><div style={{display:'flex',flexDirection:'column',gap:'10px'}}><button className="btn" style={{background:'var(--card2)',border:'1px solid var(--border)',textAlign:'left',padding:'12px',height:'auto'}} onClick={()=>enviarCobranca(1,cobrarLancamento)}><div style={{fontWeight:'600',marginBottom:'4px'}}>Opção 1 — Leve</div><div style={{fontSize:'11px',color:'var(--muted)'}}>Tom amigável e descontraído</div></button><button className="btn" style={{background:'var(--card2)',border:'1px solid var(--border)',textAlign:'left',padding:'12px',height:'auto'}} onClick={()=>enviarCobranca(2,cobrarLancamento)}><div style={{fontWeight:'600',marginBottom:'4px'}}>Opção 2 — Direto</div><div style={{fontSize:'11px',color:'var(--muted)'}}>Tom objetivo e profissional</div></button><button className="btn" style={{background:'var(--card2)',border:'1px solid var(--border)',textAlign:'left',padding:'12px',height:'auto'}} onClick={()=>enviarCobranca(3,cobrarLancamento)}><div style={{fontWeight:'600',marginBottom:'4px'}}>Opção 3 — Firme</div><div style={{fontSize:'11px',color:'var(--muted)'}}>Tom mais formal e direto</div></button></div></div></div>}
        {baixaModal&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem',zIndex:200}}><div className="card" style={{width:'100%',maxWidth:'360px',position:'relative'}}><button style={{position:'absolute',top:'12px',right:'12px',background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}} onClick={()=>setBaixaModal(null)}>✕</button><div style={{fontSize:'16px',fontWeight:'700',marginBottom:'4px'}}>Confirmar Recebimento</div><div style={{fontSize:'13px',color:'var(--muted)',marginBottom:'16px'}}>Valor total: {fmtBRL(baixaModal.valor)}</div><div className="form-group"><label className="form-label">Valor Pago (R$)</label><div className="input-prefix-wrap"><span className="input-prefix">R$</span><input type="text" inputMode="decimal" className="form-input" value={baixaValor} onChange={e=>setBaixaValor(e.target.value)} placeholder="0,00"/></div><div style={{fontSize:'11px',color:'var(--muted)',marginTop:'4px'}}>Se menor, o restante continua pendente.</div></div><div className="form-group" style={{marginBottom:'20px'}}><label className="form-label">Data do Pagamento</label><input type="date" className="form-input" value={baixaData} onChange={e=>setBaixaData(e.target.value)}/></div><button className="btn btn-green" onClick={confirmarBaixa}>Confirmar Baixa</button></div></div>}
      </div>
    );
  };

  const renderHoras=()=>{
    const totalH=horasMes.reduce((a,h)=>a+h.horas,0); const valH=totalH>0?Math.max(lucro,0)/totalH:0;
    const sorted=[...horasMes].sort((a,b)=>(b.data||'').localeCompare(a.data||''));
    return (
      <div>
        <div className="hora-resumo"><div className="hora-card"><div className="hora-card-val">{totalH%1===0?totalH+'h':totalH.toFixed(1)+'h'}</div><div className="hora-card-label">Horas no mês</div></div><div className="hora-card"><div className="hora-card-val">{valH>0?fmtBRLShort(valH):'—'}</div><div className="hora-card-label">Valor/hora</div></div><div className="hora-card"><div className="hora-card-val">{horasMes.length}</div><div className="hora-card-label">Dias trab.</div></div></div>
        <div className="card"><div className="section-title">Lançar horas</div><div className="form-group"><label className="form-label">Data</label><input type="date" className="form-input" value={hDataInput} onChange={e=>setHDataInput(e.target.value)}/></div><div className="form-group"><label className="form-label">Horas trabalhadas</label><input type="text" inputMode="decimal" className="form-input" value={hHorasInput} onChange={e=>setHHorasInput(e.target.value)} placeholder="Ex: 8"/></div><div className="form-group"><label className="form-label">Observação (opcional)</label><input type="text" className="form-input" value={hObsInput} onChange={e=>setHObsInput(e.target.value)} placeholder="Ex: Fechei cedo..."/></div><button className="btn btn-green" onClick={handleLancarHoras}>Registrar horas</button></div>
        <div className="card"><div className="section-title">Registro do mês</div>{!sorted.length?<div className="empty"><div className="empty-icon">⏱</div>Nenhuma hora registrada</div>:sorted.map(h=><div className="lancamento-item" key={h.id}><div className="lanc-icon rec" style={{background:'rgba(34,197,94,.1)'}}>⏱</div><div className="lanc-info"><div className="lanc-desc">{h.horas}h trabalhadas</div><div className="lanc-cat">{fmtData(h.data)}{h.obs?' · '+h.obs:''}</div></div><button className="lanc-del" onClick={()=>deletarHora(h.id)}>✕</button></div>)}</div>
      </div>
    );
  };

  const renderRelatorio=()=>{
    const recs=lancamentosMes.filter(l=>l.tipo==='receita'&&l.status!=='pendente');
    const desps=lancamentosMes.filter(l=>l.tipo==='despesa');
    const recCats:Record<string,number>={};recs.forEach(l=>{recCats[l.cat]=(recCats[l.cat]||0)+l.valor;});
    const despCats:Record<string,number>={};desps.forEach(l=>{despCats[l.cat]=(despCats[l.cat]||0)+l.valor;});
    const topDesp=Object.entries(despCats).sort((a,b)=>b[1]-a[1]); const maxD=topDesp.length?topDesp[0][1]:0;
    return (
      <div>
        <div className="card">
          <div className="section-title">Resumo do Mês</div>
          <div style={{display:'flex',flexDirection:'column',gap:'10px',marginBottom:'24px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px',borderRadius:'12px',background:'rgba(34,197,94,.08)',border:'1px solid rgba(34,197,94,.2)'}}><span style={{fontSize:'13px',color:'var(--green)',fontWeight:'500'}}>Entradas</span><span style={{fontSize:'17px',fontWeight:'700',color:'var(--green)'}}>{fmtBRL(rec)}</span></div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px',borderRadius:'12px',background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)'}}><span style={{fontSize:'13px',color:'var(--red)',fontWeight:'500'}}>Saídas</span><span style={{fontSize:'17px',fontWeight:'700',color:'var(--red)'}}>-{fmtBRL(desp)}</span></div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px',borderRadius:'12px',background:lucro>=0?'rgba(34,197,94,.1)':'rgba(239,68,68,.1)',border:`1px solid ${lucro>=0?'rgba(34,197,94,.3)':'rgba(239,68,68,.3)'}`}}><span style={{fontSize:'15px',fontWeight:'700',color:'var(--text)'}}>Lucro Líquido</span><span style={{fontFamily:'Syne,sans-serif',fontSize:'22px',fontWeight:'800',color:lucro>=0?'var(--green)':'var(--red)'}}>{fmtBRL(lucro)}</span></div>
          </div>
          <div className="section-title">Detalhes por Categoria</div>
          <div className="dre-row"><span className="dre-label" style={{color:'var(--green)',fontWeight:'500'}}>Receitas</span></div>
          {Object.entries(recCats).map(([c,v])=><div className="dre-row" style={{padding:'.3rem 0 .3rem 1rem'}} key={c}><span className="dre-label">— {c}</span><span className="dre-val" style={{color:'var(--muted)'}}>{fmtBRL(v)}</span></div>)}
          <div className="dre-row" style={{marginTop:'1rem'}}><span className="dre-label" style={{color:'var(--red)',fontWeight:'500'}}>Despesas</span></div>
          {Object.entries(despCats).map(([c,v])=><div className="dre-row" style={{padding:'.3rem 0 .3rem 1rem'}} key={c}><span className="dre-label">— {c}</span><span className="dre-val" style={{color:'var(--muted)'}}>-{fmtBRL(v)}</span></div>)}
        </div>
        <div className="card"><div className="section-title">Receita x Despesa (6 meses)</div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{top:10,right:10,left:-20,bottom:0}}><XAxis dataKey="name" stroke="#4B7A5A" fontSize={11} tickLine={false} axisLine={false}/><YAxis stroke="#4B7A5A" fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmtBRLShort}/><Tooltip cursor={{fill:'rgba(255,255,255,0.04)'}} contentStyle={{backgroundColor:'#122016',borderColor:'#1E3824',borderRadius:'8px',fontSize:'12px'}} formatter={(v:number)=>fmtBRL(v)}/><Legend wrapperStyle={{fontSize:'11px',color:'#4B7A5A'}}/><Bar dataKey="Receita" fill="rgba(34,197,94,.7)" radius={[4,4,0,0]}/><Bar dataKey="Despesa" fill="rgba(239,68,68,.7)" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div></div>
        <div className="card"><div className="section-title">Maiores despesas</div>{!topDesp.length?<div className="empty"><div className="empty-icon">📊</div>Sem despesas</div>:topDesp.map(([c,v])=><div className="cat-row" key={c}><span className="cat-name">{c}</span><div className="cat-bar-bg"><div className="cat-bar-fill" style={{width:`${Math.round(v/maxD*100)}%`}}></div></div><span className="cat-pct">{desp>0?Math.round(v/desp*100):0}%</span><span className="cat-val">-{fmtBRL(v)}</span></div>)}</div>
        <div className="card" style={{textAlign:'center'}}>
          <div className="section-title" style={{marginBottom:'16px'}}>Backup & Exportar</div>
          <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
            <button className="btn" style={{background:'#25D366',color:'#fff'}} onClick={exportarWhatsApp}>📱 Enviar Relatório no WhatsApp</button>
            <button className="btn btn-outline" onClick={exportarCSV}>📊 Baixar Planilha (CSV)</button>
            <hr style={{border:'none',borderTop:'1px solid var(--border)',margin:'4px 0'}}/>
            <button className="btn" style={{background:'var(--card2)',color:'var(--text)'}} onClick={exportarBackup}>📥 Salvar Backup</button>
            <label className="btn" style={{background:'var(--card2)',color:'var(--text)',cursor:'pointer',margin:0}}><input type="file" accept=".json" style={{display:'none'}} onChange={handleRestaurar}/>📤 Restaurar Backup</label>
          </div>
        </div>
      </div>
    );
  };

  const renderClientes=()=>{
    if(selectedClienteId){
      const cl=(state.clientes||[]).find(c=>c.id===selectedClienteId);
      if(!cl){setSelectedClienteId(null);return null;}
      const lc=(state.lancamentos||[]).filter(l=>l.clienteId===cl.id).sort((a,b)=>(b.data||'').localeCompare(a.data||''));
      const tg=lc.filter(l=>l.tipo==='receita').reduce((a,l)=>a+l.valor,0);
      const tp=lc.filter(l=>l.tipo==='receita'&&l.status==='pago').reduce((a,l)=>a+l.valor,0);
      const ta=lc.filter(l=>l.tipo==='receita'&&l.status==='pendente').reduce((a,l)=>a+l.valor,0);
      return (
        <div>
          <button className="btn btn-outline" style={{marginBottom:'1rem'}} onClick={()=>setSelectedClienteId(null)}>← Voltar</button>
          <div className="card"><div style={{fontSize:'18px',fontWeight:'700',marginBottom:'4px'}}>{cl.nome}</div><div style={{fontSize:'13px',color:'var(--muted)'}}>{cl.telefone||'Sem telefone'}{cl.cpf&&` · CPF: ${cl.cpf}`}</div></div>
          <div className="metrics-row" style={{gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))'}}><div className="metric"><div className="metric-label" style={{fontSize:'10px'}}>Total Gasto</div><div style={{fontSize:'17px',fontWeight:'700'}}>{fmtBRL(tg)}</div></div><div className="metric"><div className="metric-label" style={{fontSize:'10px'}}>Pago</div><div style={{fontSize:'17px',fontWeight:'700',color:'var(--green)'}}>{fmtBRL(tp)}</div></div><div className="metric"><div className="metric-label" style={{fontSize:'10px'}}>Em Aberto</div><div style={{fontSize:'17px',fontWeight:'700',color:'var(--amber)'}}>{fmtBRL(ta)}</div></div></div>
          <div className="card"><div className="section-title">Histórico</div>{!lc.length?<div className="empty"><div className="empty-icon">🛍️</div>Nenhuma compra</div>:lc.map(l=><div className="lancamento-item" key={l.id}><div className="lanc-icon" style={{background:l.status==='pendente'?'var(--amber-dim)':'var(--green-dim)',color:l.status==='pendente'?'var(--amber)':'var(--green)'}}>{l.status==='pendente'?'⏳':'💰'}</div><div className="lanc-info"><div className="lanc-desc">{l.cat}</div><div className="lanc-cat">{l.desc} · {fmtData(l.data)}</div></div><div style={{fontSize:'13px',fontWeight:'600',color:l.status==='pendente'?'var(--amber)':'var(--green)'}}>{fmtBRL(l.valor)}</div></div>)}</div>
        </div>
      );
    }
    const cc=(state.clientes||[]).map(c=>{const lc=(state.lancamentos||[]).filter(l=>l.clienteId===c.id&&l.tipo==='receita');return{...c,tg:lc.reduce((a,l)=>a+l.valor,0),ta:lc.filter(l=>l.status==='pendente').reduce((a,l)=>a+l.valor,0)};}).sort((a,b)=>b.tg-a.tg);
    return (
      <div className="card"><div className="section-title">Meus Clientes</div>{!cc.length?<div className="empty"><div className="empty-icon">👥</div>Nenhum cliente</div>:cc.map(c=><button key={c.id} style={{width:'100%',textAlign:'left',display:'flex',alignItems:'center',gap:'10px',padding:'10px 0',borderBottom:'1px solid var(--border)',background:'none',border:'none',cursor:'pointer',color:'var(--text)'}} onClick={()=>setSelectedClienteId(c.id)}><div className="lanc-icon" style={{background:'var(--card2)',color:'var(--muted)'}}>👤</div><div className="lanc-info"><div className="lanc-desc">{c.nome}</div><div className="lanc-cat">{c.telefone||'Sem telefone'}</div></div><div style={{textAlign:'right'}}><div style={{fontSize:'13px',fontWeight:'700'}}>{fmtBRL(c.tg)}</div>{c.ta>0&&<div style={{fontSize:'11px',color:'var(--amber)'}}>Dívida: {fmtBRL(c.ta)}</div>}</div></button>)}</div>
    );
  };

  const renderSuporte=()=>(
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 180px)',maxHeight:'600px'}}>
      <div className="card" style={{flex:1,display:'flex',flexDirection:'column',padding:0,overflow:'hidden'}}>
        <div style={{background:'var(--card2)',padding:'16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'12px'}}><div style={{width:'40px',height:'40px',borderRadius:'50%',background:'rgba(34,197,94,.15)',color:'var(--green)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'20px'}}>🤖</div><div><div style={{fontWeight:'700'}}>Suporte Inteligente</div><div style={{fontSize:'11px',color:'var(--muted)'}}>Tire dúvidas sobre o sistema</div></div></div>
        <div style={{flex:1,overflowY:'auto',padding:'16px',display:'flex',flexDirection:'column',gap:'16px'}}>{chatMessages.map((msg,i)=><div key={i} style={{display:'flex',justifyContent:msg.role==='user'?'flex-end':'flex-start'}}><div style={{maxWidth:'85%',padding:'12px',borderRadius:'16px',fontSize:'13px',lineHeight:'1.5',background:msg.role==='user'?'var(--green)':' var(--card2)',color:msg.role==='user'?'#060D09':'var(--text)',border:msg.role==='ai'?'1px solid var(--border)':'none'}}>{msg.text}</div></div>)}</div>
        <div style={{padding:'16px',background:'var(--surface)',borderTop:'1px solid var(--border)'}}><form onSubmit={e=>{e.preventDefault();if(!suporteMsg.trim())return;setChatMessages(p=>[...p,{role:'user',text:suporteMsg}]);setSuporteMsg('');setTimeout(()=>setChatMessages(p=>[...p,{role:'ai',text:'Entendi! Nossa integração com IA está sendo configurada. Em breve poderei te responder com precisão.'}]),1000);}} style={{display:'flex',gap:'8px'}}><input type="text" className="form-input" style={{flex:1}} placeholder="Digite sua dúvida..." value={suporteMsg} onChange={e=>setSuporteMsg(e.target.value)}/><button type="submit" style={{background:'var(--green)',color:'#060D09',border:'none',borderRadius:'10px',padding:'0 16px',cursor:'pointer',fontWeight:'600'}}>→</button></form></div>
      </div>
    </div>
  );

  const renderLogin=()=>(
    <div style={{display:'flex',minHeight:'100vh',alignItems:'center',justifyContent:'center',background:'#060D09',padding:'1rem'}}>
      <div className="card" style={{width:'100%',maxWidth:'400px'}}>
        <div style={{textAlign:'center',marginBottom:'24px'}}><div className="logo" style={{fontSize:'1.8rem',padding:0}}>Ver<span>Meu</span>Lucro</div><div style={{color:'var(--muted)',marginTop:'8px',fontSize:'13px'}}>{esqueciSenha?'Recuperar Acesso':isRegistering?'Crie sua conta':'Faça login para continuar'}</div></div>
        <form onSubmit={handleAuth}>
          <div className="form-group"><label className="form-label">E-mail</label><input type="email" className="form-input" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} required/></div>
          {!esqueciSenha&&<div className="form-group" style={{marginBottom:'24px'}}><label className="form-label">Senha</label><input type={showPassword?'text':'password'} className="form-input" value={loginSenha} onChange={e=>setLoginSenha(e.target.value)} required/><div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'8px'}}><input type="checkbox" id="sp" checked={showPassword} onChange={()=>setShowPassword(!showPassword)} style={{accentColor:'var(--green)'}}/><label htmlFor="sp" style={{fontSize:'13px',color:'var(--muted)',cursor:'pointer'}}>Mostrar senha</label></div></div>}
          {loginError&&<div style={{fontSize:'13px',textAlign:'center',marginBottom:'16px',padding:'12px',borderRadius:'8px',background:'rgba(239,68,68,.15)',color:'var(--red)'}}>{loginError}</div>}
          <button type="submit" className="btn btn-green" style={{marginBottom:'16px'}}>{esqueciSenha?'Recuperar':isRegistering?'Cadastrar':'Entrar com E-mail'}</button>
          {!esqueciSenha&&<><div style={{display:'flex',alignItems:'center',gap:'16px',marginBottom:'16px'}}><div style={{flex:1,borderTop:'1px solid var(--border)'}}></div><span style={{fontSize:'11px',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em'}}>Ou</span><div style={{flex:1,borderTop:'1px solid var(--border)'}}></div></div><button type="button" onClick={handleGoogleLogin} className="btn" style={{background:'#fff',color:'#000',marginBottom:'24px'}}>🔐 Entrar com Google</button></>}
          <div style={{display:'flex',flexDirection:'column',gap:'12px',textAlign:'center'}}><button type="button" onClick={()=>{setIsRegistering(!isRegistering);setEsqueciSenha(false);setLoginError('');}} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'13px'}}>{isRegistering||esqueciSenha?'Voltar para o Login':'Não tem conta? Cadastre-se'}</button></div>
        </form>
      </div>
    </div>
  );

  if(!currentUser) return renderLogin();

  return (
    <div className="app">
      <div className="topbar">
        <div className="logo">Ver<span>Meu</span>Lucro {syncStatus==='synced'&&<span style={{fontSize:'11px',color:'var(--green)',marginLeft:'6px'}}>☁️</span>}{syncStatus==='error'&&<span style={{fontSize:'11px',color:'var(--red)',marginLeft:'6px'}}>⚠️</span>}{syncStatus==='syncing'&&<span style={{fontSize:'11px',color:'var(--amber)',marginLeft:'6px'}}>⏳</span>}</div>
        <div style={{display:'flex',alignItems:'center',gap:'16px',flexWrap:'wrap',justifyContent:'flex-end'}}>
          <div style={{fontSize:'11px',color:'var(--muted)',background:'var(--card2)',padding:'4px 10px',borderRadius:'6px',border:'1px solid var(--border)'}}>👤 {currentUser}</div>
          <div className="month-nav"><button className="month-btn" onClick={()=>mudarMes(-1)}>‹</button><span className="month-label">{getMesNome(mesAtual)}</span><button className="month-btn" onClick={()=>mudarMes(1)}>›</button></div>
          <button onClick={handleLogout} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'13px',fontWeight:'500'}}>Sair</button>
        </div>
      </div>
      <div className="content">
        <div className="tabs">
          {['dashboard','lancar','areceber','clientes','horas','relatorio','suporte'].map(t=>(
            <button key={t} className={`tab ${activeTab===t?'active':''}`} onClick={()=>setActiveTab(t)}>
              {{dashboard:'Dashboard',lancar:'Lançar',areceber:'A Receber',clientes:'Clientes',horas:'Horas',relatorio:'Relatório',suporte:'Suporte'}[t]}
            </button>
          ))}
        </div>
        {activeTab==='dashboard'&&renderDashboard()}
        {activeTab==='lancar'&&renderLancar()}
        {activeTab==='areceber'&&renderAReceber()}
        {activeTab==='clientes'&&renderClientes()}
        {activeTab==='horas'&&renderHoras()}
        {activeTab==='relatorio'&&renderRelatorio()}
        {activeTab==='suporte'&&renderSuporte()}
      </div>
    </div>
  );
}
