// Salas do jogo online: só os dados e as regras (quem entra, quantos robôs, quando
// começa). A conversa com o Firebase fica em rede.js; aqui tudo é testável sem internet.
//
// Uma sala, como fica guardada no servidor (salas/{codigo}):
//   { codigo, criador, status: 'esperando' | 'jogando', uids: [...], jogadores: [{ uid, nome, cor }],
//     robos, nivel, partida: null | {...}, versao }
// "uids" repete os ids das pessoas porque as regras de segurança do Firestore usam essa lista.

export class ErroDeSala extends Error {}

export const MAXIMO_NA_MESA = 4;
export const LETRAS_DO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I e O, que confundem com 1 e 0
export const TAMANHO_DO_CODIGO = 5;
export const CORES = ['#e8b84a', '#8fd3b0', '#9cc3f0', '#f0b59c', '#d6a8f0', '#f08a8a'];
export const TEMPO_CONECTADO = 45000; // sem sinal há mais que isso (ms): aparece como desconectado

export function gerarCodigo(sorteio = Math.random) {
  let codigo = '';
  for (let i = 0; i < TAMANHO_DO_CODIGO; i++) codigo += LETRAS_DO_CODIGO[Math.floor(sorteio() * LETRAS_DO_CODIGO.length)];
  return codigo;
}

// O que a pessoa digitou, do jeito que o código é guardado (maiúsculas, só letras válidas).
export function normalizarCodigo(texto) {
  return [...String(texto ?? '').toUpperCase()].filter(l => LETRAS_DO_CODIGO.includes(l)).join('').slice(0, TAMANHO_DO_CODIGO);
}

function conferirPessoa({ uid, nome, cor }) {
  const limpo = String(nome ?? '').trim().slice(0, 16);
  if (!uid) throw new ErroDeSala('Não deu para entrar no jogo online. Confira a internet.');
  if (!limpo) throw new ErroDeSala('Escreva o seu nome antes.');
  return { uid, nome: limpo, cor: CORES.includes(cor) ? cor : CORES[0] };
}

export function novaSala(codigo, pessoa) {
  const quem = conferirPessoa(pessoa);
  return {
    codigo, criador: quem.uid, status: 'esperando',
    uids: [quem.uid], jogadores: [quem],
    robos: 0, nivel: 'facil', partida: null, versao: 0,
  };
}

const lugaresLivres = sala => MAXIMO_NA_MESA - sala.uids.length - sala.robos;

// Entrar (ou voltar) na sala. Quem já está nela pode voltar a qualquer hora e atualizar nome e cor.
export function entrar(sala, pessoa) {
  const quem = conferirPessoa(pessoa);
  if (sala.uids.includes(quem.uid)) {
    return { ...sala, jogadores: sala.jogadores.map(j => (j.uid === quem.uid ? quem : j)), versao: sala.versao + 1 };
  }
  if (sala.status !== 'esperando') throw new ErroDeSala('Essa partida já começou.');
  if (lugaresLivres(sala) <= 0) throw new ErroDeSala('A sala está cheia (4 lugares).');
  return { ...sala, uids: [...sala.uids, quem.uid], jogadores: [...sala.jogadores, quem], versao: sala.versao + 1 };
}

// Sair da sala. Se quem criou sai, a sala fecha (devolve null: apagar).
export function sair(sala, uid) {
  if (uid === sala.criador) return null;
  if (!sala.uids.includes(uid)) return sala;
  return { ...sala, uids: sala.uids.filter(u => u !== uid), jogadores: sala.jogadores.filter(j => j.uid !== uid), versao: sala.versao + 1 };
}

// Quantos robôs completam a mesa e de que nível (só quem criou a sala escolhe).
export function mudarRobos(sala, uid, robos, nivel = sala.nivel) {
  if (uid !== sala.criador) throw new ErroDeSala('Só quem criou a sala escolhe os robôs.');
  if (sala.status !== 'esperando') throw new ErroDeSala('Essa partida já começou.');
  const maximo = MAXIMO_NA_MESA - sala.uids.length;
  const quantos = Math.max(0, Math.min(maximo, robos));
  return { ...sala, robos: quantos, nivel: nivel === 'esperto' ? 'esperto' : 'facil', versao: sala.versao + 1 };
}

// Dá para começar? Precisa de pelo menos 2 pessoas (com 1, é só jogar contra os robôs no modo normal).
export function podeComecar(sala) {
  if (sala.status !== 'esperando') return { pode: false, motivo: 'A partida já começou.' };
  if (sala.uids.length < 2) return { pode: false, motivo: 'Espere pelo menos um amigo entrar.' };
  return { pode: true, motivo: '' };
}

// A pessoa deu sinal há pouco tempo? (presenca: { [uid]: momento do último sinal, em ms })
export function estaConectado(presenca, uid, agora = Date.now()) {
  const visto = presenca?.[uid];
  return typeof visto === 'number' && agora - visto < TEMPO_CONECTADO;
}
